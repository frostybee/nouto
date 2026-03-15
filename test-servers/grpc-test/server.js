import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { ReflectionService } from '@grpc/reflection';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 50051;

// ---------------------------------------------------------------------------
// Load proto definitions
// ---------------------------------------------------------------------------

const PROTO_DIR = path.join(__dirname, 'proto');

const LOADER_OPTS = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

const greeterDef = protoLoader.loadSync(path.join(PROTO_DIR, 'greeter.proto'), LOADER_OPTS);
const testDef    = protoLoader.loadSync(path.join(PROTO_DIR, 'test.proto'),    LOADER_OPTS);
const usersDef   = protoLoader.loadSync(path.join(PROTO_DIR, 'users.proto'),   LOADER_OPTS);

const greeterPkg = grpc.loadPackageDefinition(greeterDef);
const testPkg    = grpc.loadPackageDefinition(testDef);
const usersPkg   = grpc.loadPackageDefinition(usersDef);

// ---------------------------------------------------------------------------
// Greeter service handlers
// ---------------------------------------------------------------------------

function sayHello(call, callback) {
  const name = call.request.name || 'World';
  console.log(`[Greeter] SayHello name="${name}"`);
  callback(null, { message: `Hello, ${name}!` });
}

function sayHelloWithMetadata(call, callback) {
  const name = call.request.name || 'World';
  const meta = call.metadata.getMap();
  const keys = Object.keys(meta).filter(k => !k.startsWith(':') && k !== 'user-agent');
  console.log(`[Greeter] SayHelloWithMetadata name="${name}" metadata keys=${JSON.stringify(keys)}`);
  callback(null, {
    message: `Hello, ${name}! I received ${keys.length} metadata key(s).`,
    receivedMetadataKeys: keys,
  });
}

// ---------------------------------------------------------------------------
// TestService handlers
// ---------------------------------------------------------------------------

function echo(call, callback) {
  const msg = call.request.message || '';
  const repeat = Math.max(1, call.request.repeatCount || 1);
  const result = Array(repeat).fill(msg).join(' ');
  console.log(`[TestService] Echo message="${msg}" repeat=${repeat}`);
  callback(null, {
    message: result,
    timestamp: new Date().toISOString(),
    length: result.length,
  });
}

function ping(call, callback) {
  console.log('[TestService] Ping');
  callback(null, {
    status: 'OK',
    serverTime: new Date().toISOString(),
    version: '1.0.0',
  });
}

function requireAuth(call, callback) {
  const meta = call.metadata.getMap();
  const authHeader = meta['authorization'] || meta['Authorization'];

  if (!authHeader) {
    console.log('[TestService] RequireAuth — no Authorization header, returning UNAUTHENTICATED');
    return callback(Object.assign(new Error('Missing Authorization metadata'), {
      code: grpc.status.UNAUTHENTICATED,
    }));
  }

  const parts = authHeader.split(' ');
  const scheme = parts[0] || 'Unknown';
  const masked = parts[1] ? parts[1].slice(0, 4) + '****' : '(empty)';
  console.log(`[TestService] RequireAuth — scheme="${scheme}" value="${masked}"`);
  callback(null, { user: masked, scheme });
}

const VALID_CODES = new Set([
  grpc.status.CANCELLED, grpc.status.UNKNOWN, grpc.status.INVALID_ARGUMENT,
  grpc.status.DEADLINE_EXCEEDED, grpc.status.NOT_FOUND, grpc.status.ALREADY_EXISTS,
  grpc.status.PERMISSION_DENIED, grpc.status.RESOURCE_EXHAUSTED, grpc.status.FAILED_PRECONDITION,
  grpc.status.ABORTED, grpc.status.OUT_OF_RANGE, grpc.status.UNIMPLEMENTED,
  grpc.status.INTERNAL, grpc.status.UNAVAILABLE, grpc.status.DATA_LOSS, grpc.status.UNAUTHENTICATED,
]);

function triggerError(call, callback) {
  const code = call.request.code;
  const message = call.request.message || `Triggered error with code ${code}`;
  if (!VALID_CODES.has(code)) {
    return callback(Object.assign(new Error(`Unknown error code: ${code}`), {
      code: grpc.status.INVALID_ARGUMENT,
    }));
  }
  console.log(`[TestService] TriggerError — returning code=${code} message="${message}"`);
  callback(Object.assign(new Error(message), { code }));
}

// ---------------------------------------------------------------------------
// UserService handlers (complex schema)
// ---------------------------------------------------------------------------

// In-memory store — good enough for testing
const users = new Map();
let idCounter = 1;

function makeUser(partial) {
  const id = String(idCounter++);
  const now = new Date().toISOString();
  return {
    id,
    name: partial.name || 'Unnamed',
    age: partial.age || 0,
    verified: partial.verified || false,
    status: partial.status || 'ACTIVE',
    priority: partial.priority || 'MEDIUM',
    address: partial.address || { street: '', city: '', state: '', country: '', postalCode: '', isPrimary: true },
    contact: partial.contact || { email: '', phone: '', socials: [] },
    scores: partial.scores || { trustScore: 0, activityScore: 0, loginCount: 0, totalActions: '0', lifetimeValue: 0 },
    roles: partial.roles || ['user'],
    tags: partial.tags || [],
    metadata: partial.metadata || {},
    createdAt: now,
    updatedAt: now,
  };
}

function createUser(call, callback) {
  const { user, sendWelcomeEmail, notifyEmails } = call.request;
  if (!user || !user.name) {
    return callback(Object.assign(new Error('user.name is required'), {
      code: grpc.status.INVALID_ARGUMENT,
    }));
  }
  const created = makeUser(user);
  users.set(created.id, created);
  console.log(`[UserService] CreateUser id=${created.id} name="${created.name}" sendWelcomeEmail=${sendWelcomeEmail}`);
  callback(null, {
    user: created,
    createdAt: created.createdAt,
    emailSent: !!sendWelcomeEmail,
  });
}

function getUser(call, callback) {
  const { id } = call.request;
  const user = users.get(id);
  if (!user) {
    return callback(Object.assign(new Error(`User not found: ${id}`), {
      code: grpc.status.NOT_FOUND,
    }));
  }
  console.log(`[UserService] GetUser id=${id}`);
  callback(null, user);
}

function listUsers(call, callback) {
  const { pageSize = 10, filterStatus, minPriority, searchQuery } = call.request;

  const PRIORITY_RANK = { PRIORITY_UNSPECIFIED: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  const minRank = PRIORITY_RANK[minPriority] || 0;

  let result = [...users.values()].filter(u => {
    if (filterStatus && filterStatus !== 'STATUS_UNKNOWN' && u.status !== filterStatus) return false;
    if (minRank > 0 && (PRIORITY_RANK[u.priority] || 0) < minRank) return false;
    if (searchQuery && !u.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const total = result.length;
  result = result.slice(0, Math.min(pageSize, 100));
  console.log(`[UserService] ListUsers total=${total} returned=${result.length}`);
  callback(null, { users: result, nextPageToken: '', totalCount: total });
}

function updateUser(call, callback) {
  const { id, user, updateMask } = call.request;
  const existing = users.get(id);
  if (!existing) {
    return callback(Object.assign(new Error(`User not found: ${id}`), {
      code: grpc.status.NOT_FOUND,
    }));
  }

  // Apply only the fields listed in updateMask (or all if mask is empty)
  const fields = updateMask && updateMask.length > 0 ? updateMask : Object.keys(user || {});
  const updated = { ...existing };
  for (const field of fields) {
    if (user[field] !== undefined) updated[field] = user[field];
  }
  updated.updatedAt = new Date().toISOString();
  users.set(id, updated);
  console.log(`[UserService] UpdateUser id=${id} fields=${JSON.stringify(fields)}`);
  callback(null, updated);
}

function deleteUser(call, callback) {
  const { id, softDelete } = call.request;
  const user = users.get(id);
  if (!user) {
    return callback(Object.assign(new Error(`User not found: ${id}`), {
      code: grpc.status.NOT_FOUND,
    }));
  }
  if (softDelete) {
    user.status = 'INACTIVE';
    user.updatedAt = new Date().toISOString();
    users.set(id, user);
  } else {
    users.delete(id);
  }
  console.log(`[UserService] DeleteUser id=${id} softDelete=${softDelete}`);
  callback(null, { success: true, deletedAt: new Date().toISOString() });
}

// Seed a couple of users so ListUsers/GetUser work out of the box
makeUser({ name: 'Alice', age: 30, verified: true, status: 'ACTIVE', priority: 'HIGH',
  address: { street: '123 Main St', city: 'Springfield', state: 'IL', country: 'US', postalCode: '62701', isPrimary: true },
  contact: { email: 'alice@example.com', phone: '+1-555-0100', socials: ['github:alice', 'twitter:@alice'] },
  scores: { trustScore: 9.5, activityScore: 8.2, loginCount: 142, totalActions: '3840', lifetimeValue: 1250.75 },
  roles: ['user', 'admin'],
  tags: [{ key: 'team', value: 'engineering', system: false }, { key: 'cohort', value: '2023-Q1', system: true }],
  metadata: { plan: 'pro', region: 'us-east' },
}).id && users.set('1', { ...users.get('1') || makeUser({ name: 'Alice' }) });

// Re-seed cleanly
users.clear();
idCounter = 1;
const alice = makeUser({
  name: 'Alice', age: 30, verified: true, status: 'ACTIVE', priority: 'HIGH',
  address: { street: '123 Main St', city: 'Springfield', state: 'IL', country: 'US', postalCode: '62701', isPrimary: true },
  contact: { email: 'alice@example.com', phone: '+1-555-0100', socials: ['github:alice', 'twitter:@alice'] },
  scores: { trustScore: 9.5, activityScore: 8.2, loginCount: 142, totalActions: '3840', lifetimeValue: 1250.75 },
  roles: ['user', 'admin'],
  tags: [{ key: 'team', value: 'engineering', system: false }, { key: 'cohort', value: '2023-Q1', system: true }],
  metadata: { plan: 'pro', region: 'us-east' },
});
users.set(alice.id, alice);

const bob = makeUser({
  name: 'Bob', age: 25, verified: false, status: 'PENDING', priority: 'LOW',
  address: { street: '456 Oak Ave', city: 'Portland', state: 'OR', country: 'US', postalCode: '97201', isPrimary: true },
  contact: { email: 'bob@example.com', phone: '+1-555-0200', socials: [] },
  scores: { trustScore: 4.1, activityScore: 2.3, loginCount: 7, totalActions: '42', lifetimeValue: 0 },
  roles: ['user'],
  tags: [{ key: 'team', value: 'marketing', system: false }],
  metadata: { plan: 'free', region: 'us-west' },
});
users.set(bob.id, bob);

// ---------------------------------------------------------------------------
// Build and start server
// ---------------------------------------------------------------------------

const server = new grpc.Server();

server.addService(greeterPkg.helloworld.Greeter.service, { sayHello, sayHelloWithMetadata });
server.addService(testPkg.test.TestService.service, { echo, ping, requireAuth, triggerError });
server.addService(usersPkg.users.UserService.service, { createUser, getUser, listUsers, updateUser, deleteUser });

// Server reflection — lets HiveFetch auto-discover all services without a .proto file
// ReflectionService expects a single merged PackageDefinition, NOT an array
const reflection = new ReflectionService({ ...greeterDef, ...testDef, ...usersDef });
reflection.addToServer(server);

server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
  console.log(`gRPC test server running on localhost:${port} (plaintext)`);
  console.log('');
  console.log('  helloworld.Greeter');
  console.log('    SayHello({ name })');
  console.log('    SayHelloWithMetadata({ name })       echoes back metadata keys');
  console.log('');
  console.log('  test.TestService');
  console.log('    Echo({ message, repeatCount })');
  console.log('    Ping({})');
  console.log('    RequireAuth({})                      needs Authorization metadata');
  console.log('    TriggerError({ code, message })      returns any gRPC error code');
  console.log('');
  console.log('  users.UserService  (complex schema — nested messages, enums, maps, arrays)');
  console.log('    CreateUser({ user, sendWelcomeEmail, notifyEmails })');
  console.log('    GetUser({ id })                      seeded: id="1" (Alice), id="2" (Bob)');
  console.log('    ListUsers({ pageSize, filterStatus, minPriority, searchQuery })');
  console.log('    UpdateUser({ id, user, updateMask })');
  console.log('    DeleteUser({ id, softDelete })');
  console.log('');
  console.log('Use Server Reflection in HiveFetch — no .proto file needed.');
});
