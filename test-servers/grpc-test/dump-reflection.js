// Prints the file descriptors a gRPC server returns over reflection for one symbol:
// file names, dependencies, message names, and every field type reference.
//
// Usage: node dump-reflection.js [address] [symbol]
//   node dump-reflection.js                               # localhost:50051 test.TestService
//   node dump-reflection.js localhost:50051 users.UserService
//
// Useful when a client fails to build a schema from reflection: grpc-js servers,
// for example, send files with an empty dependency list and relative type names.
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import protobuf from 'protobufjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const address = process.argv[2] || 'localhost:50051';
const symbol = process.argv[3] || 'test.TestService';
const reflectionProto = path.resolve(here, '../../packages/core/proto/grpc/reflection/v1/reflection.proto');

const def = protoLoader.loadSync(reflectionProto, { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true });
const Svc = grpc.loadPackageDefinition(def).grpc.reflection.v1.ServerReflection;
const client = new Svc(address, grpc.credentials.createInsecure());
const FileDescriptorProto = protobuf.Root.fromJSON(require('protobufjs/google/protobuf/descriptor.json'))
  .lookupType('google.protobuf.FileDescriptorProto');

const call = client.ServerReflectionInfo();
call.on('data', (res) => {
  if (res.errorResponse) {
    console.error(`reflection error ${res.errorResponse.errorCode}: ${res.errorResponse.errorMessage}`);
  }
  for (const bytes of res.fileDescriptorResponse?.fileDescriptorProto || []) {
    const fd = FileDescriptorProto.decode(bytes);
    const typeRefs = [];
    const walk = (messages, prefix) => {
      for (const m of messages || []) {
        for (const f of m.field || []) if (f.typeName) typeRefs.push(`${prefix}${m.name}.${f.name} -> ${f.typeName}`);
        walk(m.nestedType, `${prefix}${m.name}.`);
      }
    };
    walk(fd.messageType, '');
    console.log(JSON.stringify({
      name: fd.name,
      package: fd.package,
      dependency: fd.dependency,
      messages: (fd.messageType || []).map((m) => m.name),
      services: (fd.service || []).map((s) => s.name),
      typeRefs,
    }, null, 2));
  }
  call.end();
});
call.on('end', () => process.exit(0));
call.on('error', (err) => {
  console.error('error:', err.message);
  process.exit(1);
});
call.write({ fileContainingSymbol: symbol });
