
/** Set to true to add stack traces to achieved locks (performance impact!) */
const DEBUG_MODE = false;

const _lockTimeoutMsg = 'Lock "${name}" timed out! lock.release() was not called in a timely fashion';
const _lockWaitTimeoutMsg = 'Lock "${name}" wait time expired, failed to lock target';

export interface ThreadSafeLockOptions {
    /** max amount of ms the target is allowed to be locked (and max time to wait to get it), default is 60000 (60s) */
    timeout?: number; 
    /** flag that indicates whether this lock does critical work, canceling queued lock requests if this lock is not released in time */
    critical?: boolean; 
    /** name of the lock, good for debugging purposes */
    name?: string; 
    /**  if this lock is allowed to be shared with others also requesting a shared lock. Requested lock will be exclusive otherwise (default) */
    shared?: boolean; 
    /** if you are using a string to uniquely identify the locking target, you can pass the actual object target with this option; lock.target will be set to this value instead. */
    target?: any
}

interface ThreadSafeLockQueueItem {
    resolve: (lock: ThreadSafeLock) => void;
    reject: (err: Error) => void;
    waitTimeout: NodeJS.Timeout;
    options: ThreadSafeLockOptions
}

export interface ThreadSafeLock {
    achieved: Date;
    release: () => void;
    target: any;
    name: string;
    _timeout: NodeJS.Timeout;
    _queue: ThreadSafeLockQueueItem[];
    /** If DEBUG_MODE is enabled: contains stack trace of ThreadSafe.lock call */
    stack: string
}

const _threadSafeLocks = new Map<any, ThreadSafeLock>();

export abstract class ThreadSafe {
    /**
     * 
     * @param target Target object to lock. Do not use object references!
     * @param options Locking options
     * @returns returns a lock
     */
    static lock(target: any, options: ThreadSafeLockOptions = { timeout: 60000 * 15, critical: true, name: 'unnamed lock', shared: false }): Promise<ThreadSafeLock> {
        if (typeof options !== 'object') { options = {}; }
        if (typeof options.timeout !== 'number') { options.timeout = 60 * 1000; }
        if (typeof options.critical !== 'boolean') { options.critical = true; }
        if (typeof options.name !== 'string') {
            options.name = typeof target === 'string' ? target : 'unnamed lock'; 
        }
        if (typeof options.shared !== 'boolean') {
            options.shared = false;
        }
        if (options.shared) {
            // TODO: Implement
            // console.warn('shared locking not implemented yet, using exclusive lock');
        }

        let lock = _threadSafeLocks.get(target);

        const timeoutHandler = (critical) => { 
            console.error(_lockTimeoutMsg.replace('${name}', lock.name)); 

            // Copy lock object so we can alter the original's release method to throw an exception
            let copy: ThreadSafeLock = Object.assign({}, lock);
            let originalName = lock.name;
            lock.release = () => {
                throw new Error(`Cannot release lock "${originalName}" because it timed out earlier`);
            };
            lock = copy;
            
            if (critical) {
                // cancel any queued requests
                _threadSafeLocks.delete(target);
                lock._queue.forEach(item => {
                    clearTimeout(item.waitTimeout);
                    item.reject(new Error(`Could not achieve lock because the current lock ("${lock.name}") was not released in time (and lock is flagged critical)`)); 
                });
            }
            else {
                next();
            }
        }

        const next = () => {
            clearTimeout(lock._timeout);
            if (lock._queue.length === 0) {
                return _threadSafeLocks.delete(target);
            }
            let item = lock._queue.shift();
            clearTimeout(item.waitTimeout);
            lock._timeout = setTimeout(timeoutHandler, item.options.timeout, item.options.critical);
            lock.target = item.options.target || target;
            lock.achieved = new Date();
            lock.name = item.options.name;
            lock.stack = DEBUG_MODE ? (new Error()).stack : 'not available';
            item.resolve(lock);
        };

        if (!lock) {
            // Create lock
            lock = {
                target: options.target || target,
                achieved: new Date(),
                release() {
                    next();
                },
                name: options.name,
                stack: DEBUG_MODE ? (new Error()).stack : 'not available',
                _timeout: null,
                _queue: []
            };
            lock._timeout = setTimeout(timeoutHandler, options.timeout, options.critical);
            _threadSafeLocks.set(target, lock);
            return Promise.resolve(lock);
        }
        else {
            // Add to queue
            return new Promise<ThreadSafeLock>((resolve, reject) => {
                const waitTimeout = setTimeout(() => { 
                    lock._queue.splice(lock._queue.indexOf(item), 1); 
                    if (lock._queue.length === 0) {
                        _threadSafeLocks.delete(target);
                    }
                    reject(_lockWaitTimeoutMsg.replace('${name}', options.name)); 
                }, options.timeout);
                const item: ThreadSafeLockQueueItem = { resolve, reject, waitTimeout, options };
                lock._queue.push(item);
            });
        }

    }
}