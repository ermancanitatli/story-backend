import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { AdminUsersService } from './admin-users.service';
import { AdminUser } from './schemas/admin-user.schema';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let mockAdminUserModel: {
    findOne: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };

  beforeEach(async () => {
    mockAdminUserModel = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn() }),
      findById: jest.fn().mockReturnValue({ exec: jest.fn() }),
      create: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        {
          provide: getModelToken(AdminUser.name),
          useValue: mockAdminUserModel,
        },
      ],
    }).compile();

    service = moduleRef.get<AdminUsersService>(AdminUsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verify', () => {
    it('returns null when username is empty', async () => {
      const result = await service.verify('', 'password');
      expect(result).toBeNull();
      expect(mockAdminUserModel.findOne).not.toHaveBeenCalled();
    });

    it('returns null when password is empty', async () => {
      const result = await service.verify('admin', '');
      expect(result).toBeNull();
      expect(mockAdminUserModel.findOne).not.toHaveBeenCalled();
    });

    it('returns null when user is not found', async () => {
      mockAdminUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.verify('admin', 'password');
      expect(result).toBeNull();
      expect(mockAdminUserModel.findOne).toHaveBeenCalledWith({
        username: 'admin',
        isActive: true,
      });
    });

    it('returns null when user is inactive (filter excludes it)', async () => {
      // isActive: true filter'a takıldığı için findOne null döndürür
      mockAdminUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.verify('admin', 'password');
      expect(result).toBeNull();
      expect(mockAdminUserModel.findOne).toHaveBeenCalledWith({
        username: 'admin',
        isActive: true,
      });
    });

    it('returns null when password is incorrect', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      const userDoc = {
        username: 'admin',
        passwordHash,
        isActive: true,
        role: 'admin',
        save: jest.fn(),
      };

      mockAdminUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(userDoc),
      });

      const result = await service.verify('admin', 'wrong-password');
      expect(result).toBeNull();
      expect(userDoc.save).not.toHaveBeenCalled();
    });

    it('returns user, sets lastLoginAt and calls save on correct password', async () => {
      const plainPassword = 'secret-pass-123';
      const passwordHash = await bcrypt.hash(plainPassword, 10);
      const userDoc: any = {
        username: 'admin',
        passwordHash,
        isActive: true,
        role: 'admin',
        lastLoginAt: undefined,
        save: jest.fn().mockResolvedValue(true),
      };

      mockAdminUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(userDoc),
      });

      const before = Date.now();
      const result = await service.verify('admin', plainPassword);
      const after = Date.now();

      expect(result).toBe(userDoc);
      expect(userDoc.save).toHaveBeenCalledTimes(1);
      expect(userDoc.lastLoginAt).toBeInstanceOf(Date);
      expect(userDoc.lastLoginAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(userDoc.lastLoginAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('normalizes username to lowercase and trimmed on lookup', async () => {
      mockAdminUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await service.verify('  ADMIN  ', 'password');
      expect(mockAdminUserModel.findOne).toHaveBeenCalledWith({
        username: 'admin',
        isActive: true,
      });
    });
  });

  describe('createAdmin', () => {
    it('hashes the password with bcrypt (rounds=10) and creates the user', async () => {
      const createdDoc = { _id: 'id-1' };
      mockAdminUserModel.create.mockResolvedValue(createdDoc);

      const result = await service.createAdmin({
        username: 'admin',
        password: 'mypassword',
      });

      expect(result).toBe(createdDoc);
      expect(mockAdminUserModel.create).toHaveBeenCalledTimes(1);

      const arg = mockAdminUserModel.create.mock.calls[0][0];
      expect(arg.passwordHash).toMatch(/^\$2[ab]\$10\$/);
      const matches = await bcrypt.compare('mypassword', arg.passwordHash);
      expect(matches).toBe(true);
    });

    it('normalizes username with toLowerCase().trim()', async () => {
      mockAdminUserModel.create.mockResolvedValue({});

      await service.createAdmin({
        username: '  ADMIN ',
        password: 'pass',
      });

      const arg = mockAdminUserModel.create.mock.calls[0][0];
      expect(arg.username).toBe('admin');
    });

    it('defaults role to "admin" when not specified', async () => {
      mockAdminUserModel.create.mockResolvedValue({});

      await service.createAdmin({
        username: 'someone',
        password: 'pass',
      });

      const arg = mockAdminUserModel.create.mock.calls[0][0];
      expect(arg.role).toBe('admin');
    });

    it('uses provided role when specified', async () => {
      mockAdminUserModel.create.mockResolvedValue({});

      await service.createAdmin({
        username: 'boss',
        password: 'pass',
        role: 'superadmin',
      });

      const arg = mockAdminUserModel.create.mock.calls[0][0];
      expect(arg.role).toBe('superadmin');
    });

    it('sets isActive to true', async () => {
      mockAdminUserModel.create.mockResolvedValue({});

      await service.createAdmin({
        username: 'x',
        password: 'pass',
      });

      const arg = mockAdminUserModel.create.mock.calls[0][0];
      expect(arg.isActive).toBe(true);
    });
  });

  describe('changePassword', () => {
    it('hashes new password and calls findByIdAndUpdate with passwordHash', async () => {
      mockAdminUserModel.findByIdAndUpdate.mockResolvedValue({});

      await service.changePassword('user-id-1', 'new-pass');

      expect(mockAdminUserModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
      const [id, update] = mockAdminUserModel.findByIdAndUpdate.mock.calls[0];
      expect(id).toBe('user-id-1');
      expect(update.passwordHash).toMatch(/^\$2[ab]\$10\$/);

      const matches = await bcrypt.compare('new-pass', update.passwordHash);
      expect(matches).toBe(true);
    });
  });

  describe('findById', () => {
    it('delegates to model.findById(id).exec()', async () => {
      const userDoc = { _id: 'abc', username: 'admin' };
      const execMock = jest.fn().mockResolvedValue(userDoc);
      mockAdminUserModel.findById.mockReturnValue({ exec: execMock });

      const result = await service.findById('abc');

      expect(mockAdminUserModel.findById).toHaveBeenCalledWith('abc');
      expect(execMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(userDoc);
    });

    it('returns null when model returns null', async () => {
      mockAdminUserModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.findById('missing');
      expect(result).toBeNull();
    });
  });
});
