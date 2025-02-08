import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

interface TokenIssuerStackProps extends cdk.StackProps {
    vpc: ec2.IVpc;
    securityGroup: ec2.ISecurityGroup;
    signingKeyAlias: string;
    artifactBucketName: string;
    serviceName: string;
    version: string;
}

export class TokenIssuerStack extends cdk.Stack {
    public readonly jwtSigningKey: kms.Key;

    constructor(scope: Construct, id: string, props: TokenIssuerStackProps) {
        super(scope, id, props);

        // Create KMS key for JWT signing
        this.jwtSigningKey = new kms.Key(this, 'JwtSigningKey', {
            description: 'Asymetric KMS key for signing JWT tokens',
            alias: props.signingKeyAlias,
            keyUsage: kms.KeyUsage.SIGN_VERIFY,
            keySpec: kms.KeySpec.RSA_2048,
        });

        // Create DynamoDB table for storing token information
        const tokenTable = new dynamodb.Table(this, 'TokenTable', {
            partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption: dynamodb.TableEncryption.AWS_MANAGED,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            tableName: 'user-credentials',
        });

        // Get code location based on LOCALDEV environment variable
        const isLocalDev = process.env.LOCALDEV === 'true';
        let lambdaCode: lambda.Code;

        if (isLocalDev) {
            lambdaCode = lambda.Code.fromAsset(
                path.join(__dirname, '../../src/auth-token-issuer'),
            );
        } else {
            const artifactBucket = s3.Bucket.fromBucketName(
                this,
                'ArtifactBucket',
                props.artifactBucketName,
            );
            lambdaCode = lambda.Code.fromBucket(
                artifactBucket,
                `${props.serviceName}/auth-token-issuer-${props.version}.zip`,
            );
        }

        // Create IAM role for the Lambda function
        const authTokenIssuerRole = new iam.Role(this, 'AuthTokenIssuerRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
            inlinePolicies: {
                'TokenTableAccess': new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:Query',
                                'dynamodb:GetItem',
                            ],
                            resources: [tokenTable.tableArn]
                        })
                    ]
                }),
                'KmsKeyAccess': new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'kms:Sign',
                            ],
                            resources: [this.jwtSigningKey.keyArn]
                        })
                    ]
                }),
            }
        });

        // Create Lambda function
        const authTokenIssuerFn = new lambda.Function(
            this,
            'AuthTokenIssuerFunction',
            {
                runtime: lambda.Runtime.NODEJS_22_X,
                handler: 'index.handler',
                code: lambdaCode,
                vpc: props.vpc,
                vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
                securityGroups: [props.securityGroup],
                environment: {
                    KMS_KEY_ALIAS_NAME: props.signingKeyAlias,
                    TOKEN_TABLE: tokenTable.tableName,
                },
                role: authTokenIssuerRole,
            },
        );

        // Grant permissions
        // this.jwtSigningKey.grantEncrypt(authTokenIssuerFn);
        // tokenTable.grantReadWriteData(authTokenIssuerFn);

        // Create API Gateway
        const api = new apigateway.RestApi(this, 'TokenIssuerApi', {
            cloudWatchRole: true,
            description: 'API for issuing authentication tokens',
            deployOptions: {
                stageName: 'prod',
                dataTraceEnabled: true,
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
            },
        });

        // Add routes
        const tokens = api.root.addResource('tokens');
        tokens.addMethod(
            'POST',
            new apigateway.LambdaIntegration(authTokenIssuerFn),
        );

        // Output values
        new cdk.CfnOutput(this, 'TokenIssuerApiUrl', {
            value: api.url,
            description: 'Token Issuer API URL',
        });
    }
}
