#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/stacks/auth-stack';
import { DataStack } from '../lib/stacks/data-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { FrontendStack } from '../lib/stacks/frontend-stack';

const app = new cdk.App();

const env = {
  account: process.env['CDK_DEFAULT_ACCOUNT'],
  region: 'us-east-1',
};

// CloudFront secret - must match the value configured in CloudFront custom header
// To rotate: update this value AND redeploy both WhiteboardApi and WhiteboardFrontend together
const cfSecret =
  process.env['CLOUDFRONT_SECRET'] ?? '7d83e96a2c21b854b996faa20f648a71e8db9955a12c0c5e72b2db834aabc96a';

// デプロイ順序: Auth → Data → Api → Frontend

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

app.synth();
