#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/stacks/auth-stack';
import { DataStack } from '../lib/stacks/data-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { FrontendStack } from '../lib/stacks/frontend-stack';

const app = new cdk.App();

// 環境名: -c env=dev (default), -c env=prod など
const envName = app.node.tryGetContext('env') as string ?? 'dev';
const envSuffix = envName.charAt(0).toUpperCase() + envName.slice(1); // Dev, Prod

const env = {
  account: process.env['CDK_DEFAULT_ACCOUNT'],
  region: 'us-east-1',
};

// デプロイ順序: Auth → Data → Api → Frontend

const authStack = new AuthStack(app, `Whiteboard-${envSuffix}-Auth`, {
  env,
  envName,
});

const dataStack = new DataStack(app, `Whiteboard-${envSuffix}-Data`, {
  env,
  envName,
});
dataStack.addDependency(authStack);

const apiStack = new ApiStack(app, `Whiteboard-${envSuffix}-Api`, {
  env,
  envName,
  data: dataStack,
  auth: authStack,
  cfSecret: dataStack.cfSecret,
});
apiStack.addDependency(dataStack);

const frontendStack = new FrontendStack(app, `Whiteboard-${envSuffix}-Frontend`, {
  env,
  envName,
  api: apiStack,
  cfSecret: dataStack.cfSecret,
});
frontendStack.addDependency(apiStack);

app.synth();
