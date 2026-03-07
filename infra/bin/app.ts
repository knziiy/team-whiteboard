#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/stacks/auth-stack';
import { DataStack } from '../lib/stacks/data-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { FrontendStack } from '../lib/stacks/frontend-stack';
import { WafStack } from '../lib/stacks/waf-stack';

const app = new cdk.App();

const env = {
  account: process.env['CDK_DEFAULT_ACCOUNT'],
  region: 'us-east-1',
};

const allowedCidrs: string[] = app.node.tryGetContext('allowedCidrs') ?? ['0.0.0.0/0'];

// CloudFront secret - read from environment or use default (change before deploy)
const cfSecret =
  process.env['CLOUDFRONT_SECRET'] ?? 'change-me-cloudfront-secret-' + Date.now();

// デプロイ順序: Auth → Data → Api → Frontend → Waf

const authStack = new AuthStack(app, 'WhiteboardAuth', { env });

const dataStack = new DataStack(app, 'WhiteboardData', { env });
dataStack.addDependency(authStack);

const apiStack = new ApiStack(app, 'WhiteboardApi', {
  env,
  data: dataStack,
  auth: authStack,
  cfSecret,
});
apiStack.addDependency(dataStack);

const frontendStack = new FrontendStack(app, 'WhiteboardFrontend', {
  env,
  api: apiStack,
  cfSecret,
});
frontendStack.addDependency(apiStack);

const wafStack = new WafStack(app, 'WhiteboardWaf', {
  env,
  frontend: frontendStack,
  allowedCidrs,
});
wafStack.addDependency(frontendStack);

app.synth();
