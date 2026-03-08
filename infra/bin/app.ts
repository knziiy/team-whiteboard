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
// Generate with: export CLOUDFRONT_SECRET=$(openssl rand -hex 32)
const cfSecret = process.env['CLOUDFRONT_SECRET'];
if (!cfSecret) {
  throw new Error(
    'CLOUDFRONT_SECRET environment variable is required.\n' +
    'Generate with: export CLOUDFRONT_SECRET=$(openssl rand -hex 32)',
  );
}

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
