import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';
import { GraphQLSchema, GraphQLObjectType, GraphQLInt, GraphQLString, GraphQLNonNull } from 'graphql';

let tickCount = 0;

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: { hello: { type: GraphQLString, resolve: () => 'world' } },
  }),
  subscription: new GraphQLObjectType({
    name: 'Subscription',
    fields: {
      countdown: {
        type: GraphQLInt,
        args: { from: { type: new GraphQLNonNull(GraphQLInt) } },
        subscribe: async function* (_root, { from }) {
          for (let i = from; i >= 0; i--) {
            yield { countdown: i };
            await new Promise(r => setTimeout(r, 1000));
          }
        },
      },
      tick: {
        type: GraphQLInt,
        subscribe: async function* () {
          while (true) {
            yield { tick: ++tickCount };
            await new Promise(r => setTimeout(r, 2000));
          }
        },
      },
    },
  }),
});

const server = new WebSocketServer({ port: 4000 });
useServer({ schema }, server);
console.log('GraphQL subscription server running on ws://localhost:4000');
console.log('');
console.log('Available subscriptions:');
console.log('  subscription { countdown(from: 10) }   -- counts down from N to 0');
console.log('  subscription { tick }                   -- emits incrementing number every 2s');
