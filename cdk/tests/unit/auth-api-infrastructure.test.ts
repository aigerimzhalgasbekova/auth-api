import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../../lib/network-stack';
import { TokenIssuerStack } from '../../lib/token-issuer-stack';
import { EchoApiStack } from '../../lib/echo-api-stack';

describe('AuthApiInfrastructure', () => {
    let app: App;

    beforeEach(() => {
        app = new App();
    });

    describe('NetworkStack', () => {
        let template: Template;

        beforeEach(() => {
            const stack = new NetworkStack(app, 'TestNetworkStack');
            template = Template.fromStack(stack);
        });

        test('creates VPC with correct configuration', () => {
            template.hasResourceProperties('AWS::EC2::VPC', {
                CidrBlock: '10.0.0.0/16',
                EnableDnsHostnames: true,
                EnableDnsSupport: true,
            });
        });

        test('creates security group for Lambda', () => {
            template.hasResourceProperties('AWS::EC2::SecurityGroup', {
                GroupDescription: 'Security group for Lambda functions',
                VpcId: {
                    Ref: Match.stringLikeRegexp('ApiVpc*'),
                },
            });
        });
    });

    describe('TokenIssuerStack', () => {
        let template: Template;

        beforeEach(() => {
            const networkStack = new NetworkStack(app, 'TestNetworkStack');
            const stack = new TokenIssuerStack(app, 'TestTokenIssuerStack', {
                vpc: networkStack.vpc,
                securityGroup: networkStack.lambdaSecurityGroup,
                signingKeyAlias: 'alias/signing-key',
                artifactBucketName: 'artifact-bucket',
                serviceName: 'auth-api',
                version: '1.0.0',
            });
            template = Template.fromStack(stack);
        });

        test('creates KMS key for JWT signing', () => {
            template.hasResourceProperties('AWS::KMS::Key', {
                KeySpec: 'RSA_2048',
                KeyUsage: 'SIGN_VERIFY',
            });
        });

        test('creates DynamoDB table', () => {
            template.hasResourceProperties('AWS::DynamoDB::Table', {
                BillingMode: 'PAY_PER_REQUEST',
                AttributeDefinitions: [
                    {
                        AttributeName: 'Username',
                        AttributeType: 'S',
                    },
                    {
                        AttributeName: 'Password',
                        AttributeType: 'S',
                    },
                ],
                KeySchema: [
                    {
                        AttributeName: 'Username',
                        KeyType: 'HASH',
                    },
                    {
                        AttributeName: 'Password',
                        KeyType: 'RANGE',
                    },
                ],
                SSESpecification: {
                    SSEEnabled: true,
                },
                TableName: 'existing-users',
            });
        });

        test('creates token issuer Lambda function', () => {
            template.hasResourceProperties('AWS::Lambda::Function', {
                Handler: 'index.handler',
                Runtime: 'nodejs22.x',
                VpcConfig: {
                    SecurityGroupIds: [
                        Match.objectLike({
                            'Fn::ImportValue':
                                Match.stringLikeRegexp('SecurityGroup'),
                        }),
                    ],
                    SubnetIds: [
                        Match.objectLike({
                            'Fn::ImportValue':
                                Match.stringLikeRegexp('Subnet1'),
                        }),
                        Match.objectLike({
                            'Fn::ImportValue':
                                Match.stringLikeRegexp('Subnet2'),
                        }),
                    ],
                },
            });
        });
    });

    describe('EchoApiStack', () => {
        let template: Template;

        beforeEach(() => {
            const networkStack = new NetworkStack(app, 'TestNetworkStack');
            const tokenIssuerStack = new TokenIssuerStack(
                app,
                'TestTokenIssuerStack',
                {
                    vpc: networkStack.vpc,
                    securityGroup: networkStack.lambdaSecurityGroup,
                    signingKeyAlias: 'alias/signing-key',
                    artifactBucketName: 'artifact-bucket',
                    serviceName: 'auth-api',
                    version: '1.0.0',
                },
            );
            const stack = new EchoApiStack(app, 'TestEchoApiStack', {
                vpc: networkStack.vpc,
                securityGroup: networkStack.lambdaSecurityGroup,
                jwtSigningKey: tokenIssuerStack.jwtSigningKey,
                signingKeyAlias: 'alias/signing-key',
                artifactBucketName: 'artifact-bucket',
                serviceName: 'auth-api',
                version: '1.0.0',
            });
            template = Template.fromStack(stack);
        });

        test('creates authorizer Lambda function', () => {
            template.hasResourceProperties('AWS::Lambda::Function', {
                Handler: 'index.handler',
                Runtime: 'nodejs22.x',
                Environment: {
                    Variables: {
                        KMS_KEY_ALIAS_NAME: 'alias/signing-key',
                    },
                },
            });
        });

        test('creates echo Lambda function', () => {
            template.hasResourceProperties('AWS::Lambda::Function', {
                Handler: 'index.handler',
                Runtime: 'nodejs22.x',
                VpcConfig: {
                    SecurityGroupIds: [
                        {
                            'Fn::ImportValue':
                                Match.stringLikeRegexp('SecurityGroup'),
                        },
                    ],
                    SubnetIds: [
                        {
                            'Fn::ImportValue':
                                Match.stringLikeRegexp('Subnet1'),
                        },
                        {
                            'Fn::ImportValue':
                                Match.stringLikeRegexp('Subnet2'),
                        },
                    ],
                },
            });
        });

        test('creates API Gateway with authorizer', () => {
            template.hasResourceProperties('AWS::ApiGateway::RestApi', {
                Name: 'EchoApi',
            });

            template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
                Type: 'TOKEN',
                RestApiId: {
                    Ref: Match.stringLikeRegexp('EchoApi*'),
                },
            });
        });
    });

    test('stacks have correct dependencies', () => {
        const networkStack = new NetworkStack(app, 'TestNetworkStack');
        const tokenIssuerStack = new TokenIssuerStack(
            app,
            'TestTokenIssuerStack',
            {
                vpc: networkStack.vpc,
                securityGroup: networkStack.lambdaSecurityGroup,
                signingKeyAlias: 'alias/signing-key',
                artifactBucketName: 'artifact-bucket',
                serviceName: 'auth-api',
                version: '1.0.0',
            },
        );
        const echoApiStack = new EchoApiStack(app, 'TestEchoApiStack', {
            vpc: networkStack.vpc,
            securityGroup: networkStack.lambdaSecurityGroup,
            jwtSigningKey: tokenIssuerStack.jwtSigningKey,
            signingKeyAlias: 'alias/signing-key',
            artifactBucketName: 'artifact-bucket',
            serviceName: 'auth-api',
            version: '1.0.0',
        });
        tokenIssuerStack.addDependency(networkStack);
        echoApiStack.addDependency(networkStack);
        echoApiStack.addDependency(tokenIssuerStack);

        expect(tokenIssuerStack.dependencies).toContain(networkStack);
        expect(echoApiStack.dependencies).toContain(networkStack);
        expect(echoApiStack.dependencies).toContain(tokenIssuerStack);
    });
});
