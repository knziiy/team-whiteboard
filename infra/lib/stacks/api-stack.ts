import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2int from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';
import type { DataStack } from './data-stack';
import type { AuthStack } from './auth-stack';

interface ApiStackProps extends cdk.StackProps {
  data: DataStack;
  auth: AuthStack;
  cfSecret: string;
}

export class ApiStack extends cdk.Stack {
  // HTTP API ドメイン名（CloudFront HttpOrigin 用）
  public readonly httpApiDomain: string;
  // WebSocket API ドメイン名（CloudFront HttpOrigin 用）
  public readonly wsApiDomain: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { data, auth, cfSecret } = props;

    const functionsDir = path.join(__dirname, '../../../packages/functions');

    // ─── IAM ロール ────────────────────────────────────────────────────────────

    const lambdaRole = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    for (const table of [
      data.connectionsTable,
      data.elementsTable,
      data.boardsTable,
      data.usersTable,
      data.groupsTable,
      data.groupMembersTable,
    ]) {
      table.grantReadWriteData(lambdaRole);
    }

    // ─── Lambda 共通設定 ───────────────────────────────────────────────────────

    const commonEnv: Record<string, string> = {
      COGNITO_USER_POOL_ID: auth.userPool.userPoolId,
      COGNITO_CLIENT_ID: auth.userPoolClient.userPoolClientId,
      CLOUDFRONT_SECRET: cfSecret,
      TABLE_CONNECTIONS: data.connectionsTable.tableName,
      TABLE_ELEMENTS: data.elementsTable.tableName,
      TABLE_BOARDS: data.boardsTable.tableName,
      TABLE_USERS: data.usersTable.tableName,
      TABLE_GROUPS: data.groupsTable.tableName,
      TABLE_GROUP_MEMBERS: data.groupMembersTable.tableName,
    };

    const bundling: lambdaNode.BundlingOptions = {
      minify: true,
      sourceMap: false,
      target: 'node22',
      // @aws-sdk/* は Node.js 22 Lambda ランタイムに含まれるため外部化
      externalModules: ['@aws-sdk/*'],
    };

    const commonProps: Omit<lambdaNode.NodejsFunctionProps, 'entry'> = {
      runtime: lambda.Runtime.NODEJS_22_X,
      role: lambdaRole,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      bundling,
    };

    // ─── REST Lambda ───────────────────────────────────────────────────────────

    const restFn = new lambdaNode.NodejsFunction(this, 'RestFn', {
      ...commonProps,
      entry: path.join(functionsDir, 'src/api-rest.ts'),
      handler: 'handler',
      environment: { ...commonEnv },
    });

    // ─── HTTP API Gateway ──────────────────────────────────────────────────────

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['authorization', 'content-type', 'x-cf-secret'],
      },
    });

    const restIntegration = new apigwv2int.HttpLambdaIntegration('RestIntegration', restFn);
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigwv2.HttpMethod.ANY],
      integration: restIntegration,
    });
    httpApi.addRoutes({
      path: '/',
      methods: [apigwv2.HttpMethod.ANY],
      integration: restIntegration,
    });

    // HTTP API エンドポイントは https://<id>.execute-api.<region>.amazonaws.com
    // CloudFront HttpOrigin 用にドメイン名だけ抽出
    this.httpApiDomain = cdk.Fn.select(2, cdk.Fn.split('/', httpApi.apiEndpoint));

    // ─── WebSocket Lambda ──────────────────────────────────────────────────────

    const wsConnect = new lambdaNode.NodejsFunction(this, 'WsConnectFn', {
      ...commonProps,
      entry: path.join(functionsDir, 'src/ws-connect.ts'),
      handler: 'handler',
      environment: { ...commonEnv },
    });

    const wsDisconnect = new lambdaNode.NodejsFunction(this, 'WsDisconnectFn', {
      ...commonProps,
      entry: path.join(functionsDir, 'src/ws-disconnect.ts'),
      handler: 'handler',
      environment: { ...commonEnv },
    });

    const wsMessage = new lambdaNode.NodejsFunction(this, 'WsMessageFn', {
      ...commonProps,
      entry: path.join(functionsDir, 'src/ws-message.ts'),
      handler: 'handler',
      environment: { ...commonEnv },
    });

    // ─── WebSocket API Gateway ─────────────────────────────────────────────────

    const wsApi = new apigwv2.WebSocketApi(this, 'WsApi', {
      connectRouteOptions: {
        integration: new apigwv2int.WebSocketLambdaIntegration('WsConnectInt', wsConnect),
      },
      disconnectRouteOptions: {
        integration: new apigwv2int.WebSocketLambdaIntegration('WsDisconnectInt', wsDisconnect),
      },
      defaultRouteOptions: {
        integration: new apigwv2int.WebSocketLambdaIntegration('WsMessageInt', wsMessage),
      },
    });

    // ステージ名を "ws" にすることで CloudFront /ws → API GW /ws のルーティングが一致する
    const wsStage = new apigwv2.WebSocketStage(this, 'WsStage', {
      webSocketApi: wsApi,
      stageName: 'ws',
      autoDeploy: true,
    });

    // Management API 権限
    // ARN は stage/method/@connections/* の形式が正しい（/POST/ が必要）
    const managementArn = `arn:aws:execute-api:${this.region}:${this.account}:${wsApi.apiId}/ws/POST/@connections/*`;
    const wsManagementPolicy = new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [managementArn],
    });
    wsConnect.addToRolePolicy(wsManagementPolicy);
    wsDisconnect.addToRolePolicy(wsManagementPolicy);
    wsMessage.addToRolePolicy(wsManagementPolicy);

    // WS_ENDPOINT を Lambda 環境変数に追加（CloudFormation トークン）
    const wsEndpoint = wsStage.callbackUrl;
    wsConnect.addEnvironment('WS_ENDPOINT', wsEndpoint);
    wsDisconnect.addEnvironment('WS_ENDPOINT', wsEndpoint);
    wsMessage.addEnvironment('WS_ENDPOINT', wsEndpoint);

    // WebSocket API ドメイン名（wss://<domain>/ws の <domain> 部分）
    this.wsApiDomain = cdk.Fn.select(2, cdk.Fn.split('/', wsStage.url));

    // ─── Outputs ───────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'HttpApiEndpoint', {
      value: httpApi.apiEndpoint,
      description: 'HTTP API Gateway endpoint URL',
    });
    new cdk.CfnOutput(this, 'WsApiEndpoint', {
      value: wsStage.url,
      description: 'WebSocket API Gateway endpoint URL (wss://)',
    });
  }
}
