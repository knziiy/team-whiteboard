import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import type { FrontendStack } from './frontend-stack';

interface WafStackProps extends cdk.StackProps {
  frontend: FrontendStack;
  allowedCidrs: string[];
}

export class WafStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WafStackProps) {
    super(scope, id, {
      ...props,
      // WAF for CloudFront must be deployed in us-east-1
      env: { ...props.env, region: 'us-east-1' },
    });

    const { frontend, allowedCidrs } = props;

    const ipSet = new wafv2.CfnIPSet(this, 'AllowedIpSet', {
      name: 'whiteboard-allowed-ips',
      scope: 'CLOUDFRONT',
      ipAddressVersion: 'IPV4',
      addresses: allowedCidrs,
    });

    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: 'whiteboard-acl',
      scope: 'CLOUDFRONT',
      defaultAction: { block: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'whiteboard-acl',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AllowFromAllowedIPs',
          priority: 1,
          action: { allow: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'allowed-ips',
            sampledRequestsEnabled: false,
          },
          statement: {
            ipSetReferenceStatement: {
              arn: ipSet.attrArn,
            },
          },
        },
      ],
    });

    // Associate WAF WebACL with CloudFront distribution
    new wafv2.CfnWebACLAssociation(this, 'WebAclAssociation', {
      resourceArn: `arn:aws:cloudfront::${this.account}:distribution/${frontend.distribution.distributionId}`,
      webAclArn: webAcl.attrArn,
    });

    new cdk.CfnOutput(this, 'WebAclArn', { value: webAcl.attrArn });
  }
}
