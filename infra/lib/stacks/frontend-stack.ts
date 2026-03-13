import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';
import type { ApiStack } from './api-stack';
import type { AuthStack } from './auth-stack';

interface FrontendStackProps extends cdk.StackProps {
  envName: string;
  api: ApiStack;
  auth: AuthStack;
  cfSecret: secretsmanager.ISecret;
}

export class FrontendStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { api, auth, cfSecret } = props;

    // S3 bucket for SPA
    const bucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // /api/* → HTTP API Gateway
    const restApiOrigin = new origins.HttpOrigin(api.httpApiDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      customHeaders: {
        'X-CF-Secret': cfSecret.secretValue.toString(),
      },
    });

    // /ws → WebSocket API Gateway
    // ステージ名 "ws" に対応: CloudFront /ws → API GW /ws（パス一致）
    // readTimeout をデフォルト30sから60sに延長（WebSocket keepalive との組み合わせで接続維持）
    const wsApiOrigin = new origins.HttpOrigin(api.wsApiDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      customHeaders: {
        'X-CF-Secret': cfSecret.secretValue.toString(),
      },
      readTimeout: cdk.Duration.seconds(60),
    });

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(bucket);

    // セキュリティレスポンスヘッダーポリシー
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.seconds(63072000),
          includeSubdomains: true,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: restApiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy,
        },
        '/ws': {
          origin: wsApiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        '/health': {
          origin: restApiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // Deploy frontend build
    const spaDeploy = new s3deploy.BucketDeployment(this, 'Deploy', {
      sources: [
        s3deploy.Source.asset(
          path.join(__dirname, '../../../packages/frontend/dist'),
        ),
      ],
      destinationBucket: bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      // config.json は DeployConfig で別途デプロイするため prune 対象から除外
      exclude: ['config.json'],
    });

    // Runtime config: Cognito の値をフロントエンドに自動注入
    // フロントエンドは /config.json を fetch して UserPoolId / ClientId を取得する
    // Deploy の後に実行して config.json が確実に残るようにする
    const configDeploy = new s3deploy.BucketDeployment(this, 'DeployConfig', {
      sources: [
        s3deploy.Source.jsonData('config.json', {
          cognitoUserPoolId: auth.userPool.userPoolId,
          cognitoClientId: auth.userPoolClient.userPoolClientId,
        }),
      ],
      destinationBucket: bucket,
      // config.json のみデプロイ。既存ファイルを削除しない
      prune: false,
    });
    configDeploy.node.addDependency(spaDeploy);

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
    });
  }
}
