#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { TokenIssuerStack } from '../lib/token-issuer-stack';
import { EchoApiStack } from '../lib/echo-api-stack';

const app = new cdk.App();

// Create network stack
const networkStack = new NetworkStack(app, 'NetworkStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});

// Create token issuer stack
const tokenIssuerStack = new TokenIssuerStack(app, 'TokenIssuerStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
    vpc: networkStack.vpc,
    securityGroup: networkStack.lambdaSecurityGroup,
    signingKeyAlias: process.env.SIGNING_KEY_ALIAS || 'alias/signing-key',
    artifactBucketName: process.env.ARTIFACT_BUCKET_NAME || 'artifact-bucket',
    serviceName: 'auth-api',
    version: '0.0.1',
});

// Create echo API stack
const echoApiStack = new EchoApiStack(app, 'EchoApiStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
    vpc: networkStack.vpc,
    securityGroup: networkStack.lambdaSecurityGroup,
    jwtSigningKey: tokenIssuerStack.jwtSigningKey,
    signingKeyAlias: process.env.SIGNING_KEY_ALIAS || 'alias/signing-key',
    artifactBucketName: process.env.ARTIFACT_BUCKET_NAME || 'artifact-bucket',
    serviceName: 'auth-api',
    version: '0.0.1',
});

// Add dependencies
tokenIssuerStack.addDependency(networkStack);
echoApiStack.addDependency(networkStack);
