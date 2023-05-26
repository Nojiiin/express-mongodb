import { retry } from '../src/retry';

beforeEach(() => {
    jest.resetAllMocks();
});

describe('retry tests', () => {
    const callbackMock = jest.fn();
    const loggerMock = {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
    };
    
    beforeEach(() => {
        jest.resetAllMocks();
    });
    
    test('callback resolves immediately', async () => {
        callbackMock.mockResolvedValue('resolved');
    
        const result = await retry(callbackMock, 5, 100, loggerMock);
        
        expect(result).toBe('resolved');
        expect(callbackMock).toHaveBeenCalledTimes(1);
        expect(loggerMock.warn).not.toHaveBeenCalled();
        expect(loggerMock.error).not.toHaveBeenCalled();
    });
    
    test('callback rejects immediately and no retries left', async () => {
        callbackMock.mockRejectedValue(new Error('rejected'));
    
        await expect(retry(callbackMock, 0, 100, loggerMock)).rejects.toThrow('rejected');
        
        expect(callbackMock).toHaveBeenCalledTimes(1);
        expect(loggerMock.warn).toHaveBeenCalledTimes(1);
        expect(loggerMock.error).toHaveBeenCalledTimes(1);
        expect(loggerMock.info).not.toHaveBeenCalled();
    });
    
    test('callback rejects once then resolves', async () => {
        callbackMock.mockRejectedValueOnce(new Error('rejected')).mockResolvedValueOnce('resolved');
    
        const result = await retry(callbackMock, 1, 100, loggerMock);
        
        expect(result).toBe('resolved');
        expect(callbackMock).toHaveBeenCalledTimes(2);
        expect(loggerMock.warn).toHaveBeenCalledTimes(1);
        expect(loggerMock.error).not.toHaveBeenCalled();
        expect(loggerMock.info).toHaveBeenCalledTimes(1);
    });
    
    test('callback rejects all the time and we run out of retries', async () => {
        callbackMock.mockRejectedValue(new Error('rejected'));
    
        await expect(retry(callbackMock, 2, 100, loggerMock)).rejects.toThrow('rejected');
    
        expect(callbackMock).toHaveBeenCalledTimes(3);
        expect(loggerMock.warn).toHaveBeenCalledTimes(3);
        expect(loggerMock.error).toHaveBeenCalledTimes(1);
        expect(loggerMock.info).toHaveBeenCalledTimes(2);
    });
    
    test('callback rejects twice and then resolves on the third attempt', async () => {
        callbackMock.mockRejectedValueOnce(new Error('rejected'))
                    .mockRejectedValueOnce(new Error('rejected'))
                    .mockResolvedValue('resolved');
    
        const result = await retry(callbackMock, 2, 100, loggerMock);
        
        expect(result).toBe('resolved');
        expect(callbackMock).toHaveBeenCalledTimes(3);
        expect(loggerMock.warn).toHaveBeenCalledTimes(2);
        expect(loggerMock.error).not.toHaveBeenCalled();
        expect(loggerMock.info).toHaveBeenCalledTimes(2);
    });
    
    test('callback resolves immediately and no logger passed', async () => {
        callbackMock.mockResolvedValue('resolved');
    
        const result = await retry(callbackMock, 5, 100);
        
        expect(result).toBe('resolved');
        expect(callbackMock).toHaveBeenCalledTimes(1);
    });
    
    test('callback rejects immediately and no logger passed', async () => {
        callbackMock.mockRejectedValue(new Error('rejected'));
    
        await expect(retry(callbackMock, 0, 100)).rejects.toThrow('rejected');
        
        expect(callbackMock).toHaveBeenCalledTimes(1);
    });

});