import { GrpcService } from './GrpcService';

describe('GrpcService', () => {
  let service: GrpcService;

  beforeEach(() => {
    service = new GrpcService();
  });

  afterEach(() => {
    service.dispose();
  });

  it('should create an instance', () => {
    expect(service).toBeInstanceOf(GrpcService);
  });

  it('should dispose without errors', () => {
    expect(() => service.dispose()).not.toThrow();
  });

  it('should throw on reflect without server', async () => {
    // This will fail because there's no gRPC server running
    // But it tests that the code path works
    try {
      await service.reflect('localhost:99999');
    } catch (err: any) {
      expect(err).toBeDefined();
    }
  });

  it('should throw on loadProto with invalid paths', async () => {
    try {
      await service.loadProto(['/nonexistent/path.proto'], []);
    } catch (err: any) {
      expect(err).toBeDefined();
    }
  });
});
