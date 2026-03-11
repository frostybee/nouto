import { BrunoImportService } from './BrunoImportService';

describe('BrunoImportService', () => {
  let service: BrunoImportService;

  beforeEach(() => {
    service = new BrunoImportService();
  });

  const basicBru = `
meta {
  name: Get Users
  type: http
  seq: 1
}

get {
  url: https://api.example.com/users
}
`;

  it('should parse a basic .bru file', () => {
    const result = service.importFromString(basicBru);

    expect(result.collection).toBeDefined();
    expect(result.collection.items).toHaveLength(1);
    const req = result.collection.items[0] as any;
    expect(req.name).toBe('Get Users');
    expect(req.method).toBe('GET');
    expect(req.url).toBe('https://api.example.com/users');
  });

  it('should parse POST with JSON body', () => {
    const bru = `
meta {
  name: Create User
}

post {
  url: https://api.example.com/users
}

body:json {
  {
    "name": "John",
    "email": "john@example.com"
  }
}
`;
    const result = service.importFromString(bru);
    const req = result.collection.items[0] as any;
    expect(req.method).toBe('POST');
    expect(req.body.type).toBe('json');
    expect(req.body.content).toContain('"name": "John"');
  });

  it('should parse headers', () => {
    const bru = `
meta {
  name: With Headers
}

get {
  url: https://api.example.com
}

headers {
  Authorization: Bearer token123
  Content-Type: application/json
}
`;
    const result = service.importFromString(bru);
    const req = result.collection.items[0] as any;
    expect(req.headers).toHaveLength(2);
    expect(req.headers[0].key).toBe('Authorization');
    expect(req.headers[0].value).toBe('Bearer token123');
  });

  it('should parse bearer auth', () => {
    const bru = `
meta {
  name: Auth Test
}

get {
  url: https://api.example.com
}

auth:bearer {
  token: my-secret-token
}
`;
    const result = service.importFromString(bru);
    const req = result.collection.items[0] as any;
    expect(req.auth.type).toBe('bearer');
    expect(req.auth.token).toBe('my-secret-token');
  });

  it('should parse basic auth', () => {
    const bru = `
meta {
  name: Basic Auth
}

get {
  url: https://api.example.com
}

auth:basic {
  username: admin
  password: secret
}
`;
    const result = service.importFromString(bru);
    const req = result.collection.items[0] as any;
    expect(req.auth.type).toBe('basic');
    expect(req.auth.username).toBe('admin');
    expect(req.auth.password).toBe('secret');
  });

  it('should parse query params', () => {
    const bru = `
meta {
  name: With Params
}

get {
  url: https://api.example.com/search
}

query {
  page: 1
  limit: 10
}
`;
    const result = service.importFromString(bru);
    const req = result.collection.items[0] as any;
    expect(req.params).toHaveLength(2);
    expect(req.params[0].key).toBe('page');
    expect(req.params[1].key).toBe('limit');
  });

  it('should build folder tree from file paths', () => {
    const files = new Map<string, string>();
    files.set('auth/Login.bru', `
meta {
  name: Login
}
post {
  url: https://api.example.com/login
}
`);
    files.set('auth/Logout.bru', `
meta {
  name: Logout
}
post {
  url: https://api.example.com/logout
}
`);
    files.set('Get Status.bru', `
meta {
  name: Get Status
}
get {
  url: https://api.example.com/status
}
`);

    const result = service.importFromFiles(files);
    expect(result.collection.items).toHaveLength(2); // 1 root request + 1 folder

    const rootReq = result.collection.items.find((i: any) => i.type !== 'folder') as any;
    expect(rootReq.name).toBe('Get Status');

    const folder = result.collection.items.find((i: any) => i.type === 'folder') as any;
    expect(folder.name).toBe('auth');
    expect(folder.children).toHaveLength(2);
  });

  it('should handle text body', () => {
    const bru = `
meta {
  name: Text Body
}

post {
  url: https://api.example.com
}

body:text {
  Hello World
}
`;
    const result = service.importFromString(bru);
    const req = result.collection.items[0] as any;
    expect(req.body.type).toBe('text');
    expect(req.body.content).toBe('Hello World');
  });

  it('should handle no auth as none', () => {
    const result = service.importFromString(basicBru);
    const req = result.collection.items[0] as any;
    expect(req.auth.type).toBe('none');
  });

  it('should skip non-.bru files in importFromFiles', () => {
    const files = new Map<string, string>();
    files.set('readme.md', '# README');
    files.set('test.bru', basicBru);

    const result = service.importFromFiles(files);
    expect(result.collection.items).toHaveLength(1);
  });

  it('should handle graphql body with variables', () => {
    const bru = `
meta {
  name: GraphQL
}

post {
  url: https://api.example.com/graphql
}

body:graphql {
  query { users { id name } }
}

body:graphql:vars {
  {"limit": 10}
}
`;
    const result = service.importFromString(bru);
    const req = result.collection.items[0] as any;
    expect(req.body.type).toBe('graphql');
    expect(req.body.content).toContain('query { users');
    expect(req.body.graphqlVariables).toContain('"limit"');
  });
});
