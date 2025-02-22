import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import * as path from 'path';

interface EchoApiStackProps extends cdk.StackProps {
    vpc: ec2.IVpc;
    securityGroup: ec2.ISecurityGroup;
    jwtSigningKey: kms.Key;
    signingKeyAlias: string;
    artifactBucketName: string;
    serviceName: string;
    version: string;
}

export class EchoApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: EchoApiStackProps) {
        super(scope, id, props);

        // Get code location based on LOCALDEV environment variable
        const isLocalDev = process.env.LOCALDEV === 'true';
        let authorizerCode: lambda.Code;
        let echoCode: lambda.Code;

        if (isLocalDev) {
            authorizerCode = lambda.Code.fromAsset(
                path.join(__dirname, '../../src/authorizer'),
            );
            echoCode = lambda.Code.fromAsset(
                path.join(__dirname, '../../src/echo'),
            );
        } else {
            const artifactBucket = s3.Bucket.fromBucketName(
                this,
                'ArtifactBucket',
                props.artifactBucketName,
            );
            authorizerCode = lambda.Code.fromBucket(
                artifactBucket,
                `${props.serviceName}/authorizer-${props.version}.zip`,
            );
            echoCode = lambda.Code.fromBucket(
                artifactBucket,
                `${props.serviceName}/echo-${props.version}.zip`,
            );
        }

        // Create IAM role for the Authorizer function
        const authorizerRole = new iam.Role(this, 'AuthorizerRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName(
                    'service-role/AWSLambdaVPCAccessExecutionRole',
                ),
                iam.ManagedPolicy.fromAwsManagedPolicyName(
                    'service-role/AWSLambdaBasicExecutionRole',
                ),
            ],
            inlinePolicies: {
                KmsKeyAccess: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['kms:Verify'],
                            resources: [props.jwtSigningKey.keyArn],
                        }),
                    ],
                }),
            },
        });

        // Create Lambda functions
        const authorizerFn = new lambda.Function(this, 'AuthorizerFunction', {
            role: authorizerRole,
            runtime: lambda.Runtime.NODEJS_22_X,
            handler: 'index.handler',
            code: authorizerCode,
            vpc: props.vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            securityGroups: [props.securityGroup],
            environment: {
                KMS_KEY_ALIAS_NAME: props.signingKeyAlias,
            },
        });

        // Create IAM role for the Echo function
        const echoRole = new iam.Role(this, 'EchoRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName(
                    'service-role/AWSLambdaVPCAccessExecutionRole',
                ),
                iam.ManagedPolicy.fromAwsManagedPolicyName(
                    'service-role/AWSLambdaBasicExecutionRole',
                ),
            ],
        });

        const echoFn = new lambda.Function(this, 'EchoFunction', {
            role: echoRole,
            runtime: lambda.Runtime.NODEJS_22_X,
            handler: 'index.handler',
            code: echoCode,
            vpc: props.vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            securityGroups: [props.securityGroup],
        });

        // Grant permissions
        // props.jwtSigningKey.grantDecrypt(authorizerFn);

        // Create API Gateway
        const api = new apigateway.RestApi(this, 'EchoApi', {
            cloudWatchRole: true,
            description: 'Echo API with JWT authorization',
            deployOptions: {
                stageName: 'prod',
                dataTraceEnabled: true,
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
            },
        });

        // Create authorizer
        const apiAuthorizer = new apigateway.TokenAuthorizer(
            this,
            'ApiAuthorizer',
            {
                handler: authorizerFn,
                identitySource:
                    apigateway.IdentitySource.header('Authorization'),
            },
        );

        // Add routes
        const echo = api.root.addResource('echo');
        echo.addMethod('POST', new apigateway.LambdaIntegration(echoFn), {
            authorizer: apiAuthorizer,
        });

        // Output values
        new cdk.CfnOutput(this, 'EchoApiUrl', {
            value: api.url,
            description: 'Echo API URL',
        });
    }
}
