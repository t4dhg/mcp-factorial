import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

// Mock fs and dotenv
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockDotenvConfig = vi.fn();

vi.mock('dotenv', async () => {
  const actual = await vi.importActual('dotenv');
  return {
    ...actual,
    config: mockDotenvConfig,
  };
});

// Import after mocking
const {
  loadEnv,
  getApiKey,
  getApiVersion,
  getBaseUrl,
  getConfig,
  isDebugEnabled,
  debug,
  addressSetting,
} = await import('../../config.js');
const { ConfigurationError } = await import('../../errors.js');

describe('Config Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env vars
    delete process.env.FACTORIAL_API_KEY;
    delete process.env.FACTORIAL_API_VERSION;
    delete process.env.FACTORIAL_BASE_URL;
    delete process.env.FACTORIAL_TIMEOUT_MS;
    delete process.env.FACTORIAL_MAX_RETRIES;
    delete process.env.DEBUG;
    delete process.env.ENV_FILE_PATH;
    delete process.env.HOME;
    delete process.env.USERPROFILE;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('loadEnv', () => {
    it('should load from ENV_FILE_PATH if provided and exists', () => {
      const testPath = '/custom/path/.env';
      process.env.ENV_FILE_PATH = testPath;
      mockExistsSync.mockImplementation((path: string) => path === testPath);

      loadEnv();

      expect(mockDotenvConfig).toHaveBeenCalledWith({ path: testPath });
    });

    it('should load from current working directory if .env exists', () => {
      const cwdPath = join(process.cwd(), '.env');
      mockExistsSync.mockImplementation((path: string) => path === cwdPath);

      loadEnv();

      expect(mockDotenvConfig).toHaveBeenCalledWith({ path: cwdPath });
    });

    it('should load from home directory if .env exists', () => {
      process.env.HOME = '/Users/testuser';
      const homePath = join('/Users/testuser', '.env');
      mockExistsSync.mockImplementation((path: string) => path === homePath);

      loadEnv();

      expect(mockDotenvConfig).toHaveBeenCalledWith({ path: homePath });
    });

    it('should load from USERPROFILE on Windows if HOME not set', () => {
      process.env.USERPROFILE = 'C:\\Users\\testuser';
      const userProfilePath = join('C:\\Users\\testuser', '.env');
      mockExistsSync.mockImplementation((path: string) => path === userProfilePath);

      loadEnv();

      expect(mockDotenvConfig).toHaveBeenCalledWith({ path: userProfilePath });
    });

    it.each(['turborepo', 'projects'])(
      'does not look for a .env in the %s folder under the home directory',
      folder => {
        process.env.HOME = '/Users/testuser';
        const projectPath = join('/Users/testuser', folder, '.env');
        mockExistsSync.mockImplementation((path: string) => path === projectPath);

        loadEnv();

        expect(mockDotenvConfig).not.toHaveBeenCalledWith({ path: projectPath });
      }
    );

    it('loads nothing else when ENV_FILE_PATH names a file that does not exist', () => {
      process.env.ENV_FILE_PATH = '/custom/path/.env';
      const cwdPath = join(process.cwd(), '.env');
      mockExistsSync.mockImplementation((path: string) => path === cwdPath);

      loadEnv();

      expect(mockDotenvConfig).not.toHaveBeenCalled();
    });

    describe('address settings', () => {
      const ADDRESS_SETTINGS = [
        'FACTORIAL_BASE_URL',
        'FACTORIAL_OAUTH_AUTHORIZE_URL',
        'FACTORIAL_OAUTH_TOKEN_URL',
        'FACTORIAL_OAUTH_REVOKE_URL',
      ];
      const cwdPath = join(process.cwd(), '.env');

      beforeEach(() => {
        for (const name of ADDRESS_SETTINGS) delete process.env[name];
      });
      afterEach(() => {
        for (const name of ADDRESS_SETTINGS) delete process.env[name];
        mockDotenvConfig.mockReset();
        mockExistsSync.mockReturnValue(false);
        loadEnv();
      });

      it.each(ADDRESS_SETTINGS)('refuses %s from a .env file the server found by itself', name => {
        mockExistsSync.mockImplementation((path: string) => path === cwdPath);
        mockDotenvConfig.mockImplementation(() => {
          process.env[name] = 'https://elsewhere.example.test/x';
          process.env.FACTORIAL_API_KEY = 'test-key-from-file';
        });

        loadEnv();

        expect(process.env[name]).toBeUndefined();
        expect(() => addressSetting(name)).toThrow(ConfigurationError);
        expect(() => addressSetting(name)).toThrow(new RegExp(name));
        expect(() => addressSetting(name)).toThrow(/ENV_FILE_PATH/);
        expect(() => addressSetting(name)).toThrow(cwdPath);
        // Everything else in the file still applies.
        expect(process.env.FACTORIAL_API_KEY).toBe('test-key-from-file');
      });

      it('refuses an address from a .env in the home directory too', () => {
        process.env.HOME = '/Users/testuser';
        const homePath = join('/Users/testuser', '.env');
        mockExistsSync.mockImplementation((path: string) => path === homePath);
        mockDotenvConfig.mockImplementation(() => {
          process.env.FACTORIAL_BASE_URL = 'https://elsewhere.example.test/x';
        });

        loadEnv();

        expect(() => getBaseUrl()).toThrow(ConfigurationError);
        expect(() => getBaseUrl()).toThrow(homePath);
      });

      it('sends the API key nowhere when the base URL came from a found .env', () => {
        mockExistsSync.mockImplementation((path: string) => path === cwdPath);
        mockDotenvConfig.mockImplementation(() => {
          process.env.FACTORIAL_BASE_URL = 'https://elsewhere.example.test/x';
        });

        loadEnv();

        expect(() => getBaseUrl()).toThrow(ConfigurationError);
      });

      it('accepts an address from the file ENV_FILE_PATH names', () => {
        process.env.ENV_FILE_PATH = '/custom/path/.env';
        mockExistsSync.mockImplementation((path: string) => path === '/custom/path/.env');
        mockDotenvConfig.mockImplementation(() => {
          process.env.FACTORIAL_BASE_URL = 'https://demo.example.test/x';
        });

        loadEnv();

        expect(getBaseUrl()).toBe('https://demo.example.test/x');
      });

      it('accepts an address that was already in the environment', () => {
        process.env.FACTORIAL_BASE_URL = 'https://demo.example.test/x';
        mockExistsSync.mockImplementation((path: string) => path === cwdPath);
        mockDotenvConfig.mockImplementation(() => {
          process.env.FACTORIAL_API_KEY = 'test-key-from-file';
        });

        loadEnv();

        expect(getBaseUrl()).toBe('https://demo.example.test/x');
      });

      it('forgets a refusal once the settings are loaded again without it', () => {
        mockExistsSync.mockImplementation((path: string) => path === cwdPath);
        mockDotenvConfig.mockImplementation(() => {
          process.env.FACTORIAL_BASE_URL = 'https://elsewhere.example.test/x';
        });
        loadEnv();
        mockDotenvConfig.mockReset();

        loadEnv();

        expect(getBaseUrl()).toBe('https://api.factorialhr.com/api/2026-07-01/resources');
      });
    });

    it('should fall back to default dotenv behavior if no .env found', () => {
      mockExistsSync.mockReturnValue(false);

      loadEnv();

      expect(mockDotenvConfig).toHaveBeenCalledWith();
    });
  });

  describe('getApiKey', () => {
    it('should return API key from environment', () => {
      process.env.FACTORIAL_API_KEY = 'test-key-123';
      expect(getApiKey()).toBe('test-key-123');
    });

    it('should throw error if API key is not set', () => {
      delete process.env.FACTORIAL_API_KEY;
      expect(() => getApiKey()).toThrow('FACTORIAL_API_KEY is not set');
    });

    it('should include helpful error message with setup instructions', () => {
      delete process.env.FACTORIAL_API_KEY;
      expect(() => getApiKey()).toThrow(/github\.com\/t4dhg\/mcp-factorial/);
    });
  });

  describe('getApiVersion', () => {
    it('should return API version from environment', () => {
      process.env.FACTORIAL_API_VERSION = '2024-01-01';
      expect(getApiVersion()).toBe('2024-01-01');
    });

    it('should return default version if not set', () => {
      delete process.env.FACTORIAL_API_VERSION;
      expect(getApiVersion()).toBe('2026-07-01');
    });
  });

  describe('getBaseUrl', () => {
    it('should return custom base URL from environment', () => {
      process.env.FACTORIAL_BASE_URL = 'https://custom.api.com';
      expect(getBaseUrl()).toBe('https://custom.api.com');
    });

    it('refuses a base URL over plain http on a remote host', () => {
      process.env.FACTORIAL_BASE_URL = 'http://api.example.test/resources';
      expect(() => getBaseUrl()).toThrow(ConfigurationError);
      expect(() => getBaseUrl()).toThrow(/FACTORIAL_BASE_URL/);
      expect(() => getBaseUrl()).toThrow(/https/);
    });

    it.each(['http://127.0.0.1:1', 'http://localhost:3000/x', 'http://[::1]:3000'])(
      'accepts plain http on the loopback address %s',
      url => {
        process.env.FACTORIAL_BASE_URL = url;
        expect(getBaseUrl()).toBe(url);
      }
    );

    it('names the variable when the base URL is not a URL', () => {
      process.env.FACTORIAL_BASE_URL = 'api.example.test';
      expect(() => getBaseUrl()).toThrow(ConfigurationError);
      expect(() => getBaseUrl()).toThrow(/FACTORIAL_BASE_URL/);
    });

    it('should construct default base URL with API version', () => {
      delete process.env.FACTORIAL_BASE_URL;
      process.env.FACTORIAL_API_VERSION = '2024-05-01';
      expect(getBaseUrl()).toBe('https://api.factorialhr.com/api/2024-05-01/resources');
    });

    it('should use default API version if not specified', () => {
      delete process.env.FACTORIAL_BASE_URL;
      delete process.env.FACTORIAL_API_VERSION;
      expect(getBaseUrl()).toBe('https://api.factorialhr.com/api/2026-07-01/resources');
    });
  });

  describe('getConfig', () => {
    it('should return complete configuration object', () => {
      process.env.FACTORIAL_API_KEY = 'test-key';
      process.env.FACTORIAL_API_VERSION = '2024-01-01';
      process.env.FACTORIAL_BASE_URL = 'https://custom.api.com';
      process.env.FACTORIAL_TIMEOUT_MS = '60000';
      process.env.FACTORIAL_MAX_RETRIES = '5';
      process.env.DEBUG = 'true';

      const config = getConfig();

      expect(config).toEqual({
        apiKey: 'test-key',
        apiVersion: '2024-01-01',
        baseUrl: 'https://custom.api.com',
        timeout: 60000,
        maxRetries: 5,
        debug: true,
      });
    });

    it('should use defaults when environment variables not set', () => {
      process.env.FACTORIAL_API_KEY = 'test-key';

      const config = getConfig();

      expect(config.timeout).toBe(30000);
      expect(config.maxRetries).toBe(3);
      expect(config.debug).toBe(false);
    });

    it('should parse numeric values correctly', () => {
      process.env.FACTORIAL_API_KEY = 'test-key';
      process.env.FACTORIAL_TIMEOUT_MS = '45000';
      process.env.FACTORIAL_MAX_RETRIES = '7';

      const config = getConfig();

      expect(config.timeout).toBe(45000);
      expect(config.maxRetries).toBe(7);
      expect(typeof config.timeout).toBe('number');
      expect(typeof config.maxRetries).toBe('number');
    });
  });

  describe('isDebugEnabled', () => {
    it('should return true when DEBUG is "true"', () => {
      process.env.DEBUG = 'true';
      expect(isDebugEnabled()).toBe(true);
    });

    it('should return false when DEBUG is not "true"', () => {
      process.env.DEBUG = 'false';
      expect(isDebugEnabled()).toBe(false);
    });

    it('should return false when DEBUG is not set', () => {
      delete process.env.DEBUG;
      expect(isDebugEnabled()).toBe(false);
    });

    it('should return false for other truthy strings', () => {
      process.env.DEBUG = '1';
      expect(isDebugEnabled()).toBe(false);
    });
  });

  describe('debug', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should log message when debug is enabled', () => {
      process.env.DEBUG = 'true';
      debug('test message');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[.*\] \[mcp-factorial\] test message/)
      );
    });

    it('should log message with data when debug is enabled', () => {
      process.env.DEBUG = 'true';
      debug('test message', { foo: 'bar' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[.*\] \[mcp-factorial\] test message/),
        expect.stringContaining('"foo": "bar"')
      );
    });

    it('should not log when debug is disabled', () => {
      process.env.DEBUG = 'false';
      debug('test message');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should include timestamp in log message', () => {
      process.env.DEBUG = 'true';
      const beforeTime = new Date().toISOString().substring(0, 16); // First 16 chars
      debug('test message');
      const afterTime = new Date().toISOString().substring(0, 16);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`\\[${beforeTime}.*\\]`))
      );
    });

    it('should format data as JSON with indentation', () => {
      process.env.DEBUG = 'true';
      debug('test', { nested: { data: 'value' } });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(/\{\n\s+"nested"/)
      );
    });
  });
});
