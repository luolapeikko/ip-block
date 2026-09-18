import {type ILoggerLike, LogLevel, type LogMapInfer, MapLogger} from '@avanio/logger-like';
import type {IAsyncCacheWithEvents} from '@luolapeikko/cache-types';
import {EventEmitter} from 'events';
import type {IBlockIpDriver} from '../interfaces/IBlockIpDriver';
import type {IpAddress} from '../types/IpAddress';

export type IpBlockCacheDriverEventMap = {
	expires: [address: IpAddress];
};

const defaultLogMap = {
	constructor: LogLevel.None,
	expires: LogLevel.None,
	get_count: LogLevel.None,
	init: LogLevel.None,
	list: LogLevel.None,
	remove: LogLevel.None,
	set_count: LogLevel.None,
	unload: LogLevel.None,
} as const;

export type IpBlockCacheDriverLogMapType = LogMapInfer<typeof defaultLogMap>;

/**
 * Creates IBlockIpDriver around IAsyncCacheWithEvents cache type (like ExpireTimeoutCache or ExpireCache from @avanio/expire-cache).
 * @example
 * const driver = new IpBlockCacheDriver(new ExpireTimeoutCache());
 * @since v0.0.1
 */
export class IpBlockCacheDriver extends EventEmitter<IpBlockCacheDriverEventMap> implements IBlockIpDriver {
	private isInit = false;
	private cache: IAsyncCacheWithEvents<number, IpAddress>;
	public readonly logger: MapLogger<IpBlockCacheDriverLogMapType>;

	public constructor(cache: IAsyncCacheWithEvents<number, IpAddress>, logger?: ILoggerLike, logMapping?: Partial<IpBlockCacheDriverLogMapType>) {
		super();
		this.logger = new MapLogger(logger, {...defaultLogMap, ...logMapping});
		this.logger.logKey('constructor', 'IpBlockCacheDriver constructor');
		this.cache = cache;
		this.handleExpiresEvent = this.handleExpiresEvent.bind(this);
	}

	public init(): void | Promise<void> {
		this.handleInit();
	}

	public unload(): void | Promise<void> {
		this.logger.logKey('unload', 'IpBlockCacheDriver unload');
		this.cache.removeListener('delete', this.handleExpiresEvent);
		this.isInit = false;
		return this.cache.clear();
	}

	public async getIpCount(ip: IpAddress): Promise<number> {
		this.logger.logKey('get_count', `IpBlockCacheDriver getIpCount: ${ip}`);
		this.handleInit();
		return (await this.cache.get(ip)) ?? 0;
	}

	public setIpCount(ip: IpAddress, count: number, clearTimeout: number): Promise<void> {
		this.logger.logKey('set_count', `IpBlockCacheDriver setIpCount: ${ip}, ${count.toString()}, ${clearTimeout.toString()}`);
		this.handleInit();
		this.cache.set(ip, count, new Date(Date.now() + clearTimeout));
		return Promise.resolve();
	}

	public removeIp(ip: IpAddress): boolean | Promise<boolean> {
		this.logger.logKey('remove', `IpBlockCacheDriver removeIp: ${ip}`);
		this.handleInit();
		return this.cache.delete(ip);
	}

	public listIpEntries(): AsyncIterable<[IpAddress, number]> | Iterable<[IpAddress, number]> {
		this.logger.logKey('list', 'IpBlockCacheDriver listIpEntries');
		this.handleInit();
		return this.cache.entries();
	}

	private handleInit() {
		if (!this.isInit) {
			this.logger.logKey('init', 'IpBlockCacheDriver init');
			this.isInit = true;
			this.cache.on('expires', this.handleExpiresEvent);
		}
	}

	private handleExpiresEvent(addr: IpAddress): void {
		this.logger.logKey('expires', `IpBlockCacheDriver handleExpiresEvent: ${addr}`);
		this.emit('expires', addr);
	}
}
