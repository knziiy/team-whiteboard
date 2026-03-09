import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

interface DataStackProps extends cdk.StackProps {
  envName: string;
}

export class DataStack extends cdk.Stack {
  public readonly connectionsTable: dynamodb.Table;
  public readonly elementsTable: dynamodb.Table;
  public readonly boardsTable: dynamodb.Table;
  public readonly usersTable: dynamodb.Table;
  public readonly groupsTable: dynamodb.Table;
  public readonly groupMembersTable: dynamodb.Table;
  public readonly cfSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { envName } = props;
    const prefix = `wb-${envName}`;

    // wb-{env}-connections: PK=connectionId, GSI boardId-index, TTL on `ttl`
    this.connectionsTable = new dynamodb.Table(this, 'Connections', {
      tableName: `${prefix}-connections`,
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.connectionsTable.addGlobalSecondaryIndex({
      indexName: 'boardId-index',
      partitionKey: { name: 'boardId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.connectionsTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // wb-{env}-elements: PK=boardId, SK=elementId
    this.elementsTable = new dynamodb.Table(this, 'Elements', {
      tableName: `${prefix}-elements`,
      partitionKey: { name: 'boardId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'elementId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // wb-{env}-boards: PK=boardId
    this.boardsTable = new dynamodb.Table(this, 'Boards', {
      tableName: `${prefix}-boards`,
      partitionKey: { name: 'boardId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // wb-{env}-users: PK=userId
    this.usersTable = new dynamodb.Table(this, 'Users', {
      tableName: `${prefix}-users`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // wb-{env}-groups: PK=groupId
    this.groupsTable = new dynamodb.Table(this, 'Groups', {
      tableName: `${prefix}-groups`,
      partitionKey: { name: 'groupId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // wb-{env}-group-members: PK=groupId, SK=userId, GSI userId-index
    this.groupMembersTable = new dynamodb.Table(this, 'GroupMembers', {
      tableName: `${prefix}-group-members`,
      partitionKey: { name: 'groupId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.groupMembersTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // CloudFront origin verification secret
    this.cfSecret = new secretsmanager.Secret(this, 'CloudFrontSecret', {
      secretName: `whiteboard/${envName}/cloudfront-secret`,
      description: 'CloudFront origin verification secret',
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64,
      },
    });
  }
}
