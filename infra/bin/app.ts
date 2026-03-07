#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/stacks/network-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { ComputeStack } from '../lib/stacks/compute-stack';
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

const networkStack = new NetworkStack(app, 'WhiteboardNetwork', { env });

const authStack = new AuthStack(app, 'WhiteboardAuth', { env });

const computeStack = new ComputeStack(app, 'WhiteboardCompute', {
  env,
  network: networkStack,
  auth: authStack,
});
computeStack.addDependency(networkStack);
computeStack.addDependency(authStack);

const frontendStack = new FrontendStack(app, 'WhiteboardFrontend', {
  env,
  compute: computeStack,
  cfSecret,
});
frontendStack.addDependency(computeStack);

const wafStack = new WafStack(app, 'WhiteboardWaf', {
  env,
  frontend: frontendStack,
  allowedCidrs,
});
wafStack.addDependency(frontendStack);

app.synth();
