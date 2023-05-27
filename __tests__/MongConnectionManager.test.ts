import { MongoClient } from "mongodb";
import { MongoConnectionManager, AggregateError } from "../src/MongoConnectionManager";

const mClient = {
    close: jest.fn(),
    on: jest.fn((event: string, callback: CallableFunction) => { }),
};

jest.mock('mongodb', () => {
    return {
        MongoClient: {
            connect: jest.fn(() => Promise.resolve(mClient)),
        },
    };
});

describe('MongoConnectionManager', () => {
    let mongoConnectionManager: MongoConnectionManager;
    let mockClient: MongoClient;

    beforeEach(() => {
        mockClient = mClient as unknown as MongoClient;
        mongoConnectionManager = new MongoConnectionManager(
            'mongodb://localhost:27017', 
            undefined,
             { retryAttempts: 3, retryInterval: 10 });
        (MongoClient.connect as jest.Mock).mockImplementation(() => Promise.resolve(mClient));
    });

    afterEach(() => {
        // Cleanup and reset mocks
        (MongoClient.connect as jest.Mock).mockReset();
    });

    // Test 1: Constructor Initialization
    it('should be correctly instantiated with valid constructor parameters', () => {
        expect(mongoConnectionManager).toBeInstanceOf(MongoConnectionManager);
    });

    // Test 2: getConnection Success
    it('should correctly establish a connection when the database is available', async () => {
        await mongoConnectionManager.getConnection();
        expect(mongoConnectionManager.isConnnected()).toBe(true);
    });

    // Test 3: getConnection Failure
    it('should throw an error when the database is not reachable', async () => {
        (MongoClient.connect as jest.Mock).mockImplementation(() => Promise.reject(new Error('Database not reachable')));
        await expect(mongoConnectionManager.getConnection()).rejects.toThrow('Database not reachable');
    });

    // Test 4: isConnected Correctness
    it('should return correct connection status', async () => {
        expect(mongoConnectionManager.isConnnected()).toBe(false);
        await mongoConnectionManager.getConnection();
        expect(mongoConnectionManager.isConnnected()).toBe(true);
    });

    // Test 5: onConnectionChanged Callbacks Invocation
    it('should correctly invoke callbacks registered through onConnectionChanged', async () => {
        const mockCallback1 = jest.fn();
        const mockCallback2 = jest.fn();
        mongoConnectionManager.onConnectionChanged(mockCallback1);
        mongoConnectionManager.onConnectionChanged(mockCallback2);
        await mongoConnectionManager.getConnection();
        expect(mockCallback1).toHaveBeenCalled();
        expect(mockCallback2).toHaveBeenCalled();
    });

    // Test 6: onConnectionChanged Callback Error Handling
    it('should handle and throw any errors occurring within onConnectionChanged callbacks', async () => {
        const errorThrowingCallback = () => {
            throw new Error('Callback error');
        };
        mongoConnectionManager.onConnectionChanged(errorThrowingCallback);
        await expect(mongoConnectionManager.getConnection()).rejects.toThrow(
            expect.objectContaining({
                message: 'Errors occurred in onConnectionChanged callbacks',
                errors: expect.arrayContaining([expect.objectContaining({ message: 'Callback error' })]),
            }));
    });

    // Test 7: onConnect Status Change
    it('should correctly change connection status on successful connection', async () => {
        expect(mongoConnectionManager.isConnnected()).toBe(false);
        await mongoConnectionManager.getConnection();
        expect(mongoConnectionManager.isConnnected()).toBe(true);
    });

    // Test 8: createConnectionPromise Failure
    it('should reject the created connection promise when the database is not reachable', async () => {
        (MongoClient.connect as jest.Mock).mockRejectedValue(new Error('Database not reachable'));
        const connectionPromise = mongoConnectionManager.createConnectionPromise();
        await expect(connectionPromise).rejects.toThrow('Database not reachable');
    });

    // Test 9: Retry Mechanism
    it('should retry connection when it fails', async () => {
        // Fail the first two attempts to connect
        (MongoClient.connect as jest.Mock)
            .mockImplementationOnce(() => Promise.reject(new Error('Connection attempt 1 failed')))
            .mockImplementationOnce(() => Promise.reject(new Error('Connection attempt 2 failed')))
            .mockImplementationOnce(() => Promise.resolve(mClient));

        await mongoConnectionManager.getConnection();
        expect(MongoClient.connect).toHaveBeenCalledTimes(3);
    });


    // Test 10: Reusing Existing Connection Promise
    it('should reuse existing connection promise if called again before connection', async () => {
        const firstCall = mongoConnectionManager.getConnection();
        const secondCall = mongoConnectionManager.getConnection();
        expect(firstCall).toStrictEqual(secondCall);
    });

    // Test 11: AggregateError for Multiple Callback Errors
    it('should aggregate multiple errors from onConnectionChanged callbacks', async () => {
        const errorThrowingCallback1 = () => {
            throw new Error('Callback error 1');
        };
        const errorThrowingCallback2 = () => {
            throw new Error('Callback error 2');
        };

        mongoConnectionManager.onConnectionChanged(errorThrowingCallback1);
        mongoConnectionManager.onConnectionChanged(errorThrowingCallback2);

        await expect(mongoConnectionManager.getConnection()).rejects.toThrow(
            expect.objectContaining({
                message: 'Errors occurred in onConnectionChanged callbacks',
                errors: expect.arrayContaining([
                    expect.objectContaining({ message: 'Callback error 1' }),
                    expect.objectContaining({ message: 'Callback error 2' }),
                ]),
            }));
    });
});