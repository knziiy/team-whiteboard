/**
 * DynamoDB Local にテーブルを作成するスクリプト
 * 使い方: npx tsx scripts/create-tables-local.ts
 */
import {
  DynamoDBClient,
  CreateTableCommand,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  endpoint: 'http://localhost:8000',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});

async function createTable(params: Parameters<typeof client.send>[0] extends { input: infer I } ? I : never): Promise<void> {
  try {
    await client.send(new CreateTableCommand(params as any));
    console.log(`✓ Created table: ${(params as any).TableName}`);
  } catch (err) {
    if (err instanceof ResourceInUseException) {
      console.log(`- Already exists: ${(params as any).TableName}`);
    } else {
      throw err;
    }
  }
}

async function main() {
  // wb-connections
  await createTable({
    TableName: 'wb-connections',
    AttributeDefinitions: [
      { AttributeName: 'connectionId', AttributeType: 'S' },
      { AttributeName: 'boardId', AttributeType: 'S' },
    ],
    KeySchema: [{ AttributeName: 'connectionId', KeyType: 'HASH' }],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'boardId-index',
        KeySchema: [{ AttributeName: 'boardId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  });

  // wb-elements
  await createTable({
    TableName: 'wb-elements',
    AttributeDefinitions: [
      { AttributeName: 'boardId', AttributeType: 'S' },
      { AttributeName: 'elementId', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'boardId', KeyType: 'HASH' },
      { AttributeName: 'elementId', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  });

  // wb-boards
  await createTable({
    TableName: 'wb-boards',
    AttributeDefinitions: [
      { AttributeName: 'boardId', AttributeType: 'S' },
    ],
    KeySchema: [{ AttributeName: 'boardId', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
  });

  // wb-users
  await createTable({
    TableName: 'wb-users',
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
    ],
    KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
  });

  // wb-groups
  await createTable({
    TableName: 'wb-groups',
    AttributeDefinitions: [
      { AttributeName: 'groupId', AttributeType: 'S' },
    ],
    KeySchema: [{ AttributeName: 'groupId', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
  });

  // wb-group-members
  await createTable({
    TableName: 'wb-group-members',
    AttributeDefinitions: [
      { AttributeName: 'groupId', AttributeType: 'S' },
      { AttributeName: 'userId', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'groupId', KeyType: 'HASH' },
      { AttributeName: 'userId', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'userId-index',
        KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  });

  console.log('\nAll tables ready.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
