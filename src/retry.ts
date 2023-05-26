interface ILogger {
    error: (message: string) => void;
    warn: (message: string) => void;
    info: (message: string) => void;
}

export function retry(callback: () => Promise<any>, retries = 5, delay = 500, logger: ILogger | null = null) {
    return new Promise((resolve, reject) => {
        callback().then(resolve).catch((err) => {
            logger?.warn(`try failed: ${err.message}`);
            if (retries === 0) {
                logger?.error(`fatal fail: ${err.message}`);
                reject(err);
            } else {
                let jitter = delay * 0.5 * Math.random(); // adding jitter
                logger?.info(`retrying in ${delay + jitter}ms, ${retries} attempts left}`);
                setTimeout(() => {
                    retry(callback, retries - 1, delay * 2, logger).then(resolve).catch(reject);
                }, delay + jitter);
            }
        });
    });
}