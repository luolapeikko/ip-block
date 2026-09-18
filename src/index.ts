import {type ILoggerLike, LogLevel, type LogMapInfer, MapLogger} from '@avanio/logger-like';
import {Err, type IResult, Ok} from '@luolapeikko/result-option';
import {type Loadable, resolveLoadable, toError} from '@luolapeikko/ts-common';
import {EventEmitter} from 'events';
import type {Address4, Address6} from 'ip-address';
import type {IBlockIpDriver} from './interfaces/IBlockIpDriver';
import type {BlockResponse} from './types/BlockResponse';
import {type BlockRule, haveRuleDelay} from './types/BlockRule';
import {assertIpAddress, getIpAddress, type IpAddress} from './types/IpAddress';

export * from './drivers';
export * from './types';

/**
 * Build the delay based on the count and rule.
 * @param {number} count - The number of requests from the IP
 * @param {BlockRule} rule - The block rule to check against
 * @returns {number} - The delay in milliseconds
 * @since v0.0.1
 */
export function buildDelay(count: number, rule: BlockRule): number {
	if (!haveRuleDelay(rule) || count < rule.delayThreshold) {
		return 0;
	}
	return (count - rule.delayThreshold) * rule.delay;
}

/**
 * Check against the block rule if the IP is blocked or not.
 * @param {number} count - The number of requests from the IP
 * @param {BlockRule} rule - The block rule to check against
 * @returns {boolean} - If the IP is blocked or not
 * @since v0.0.1
 */
export function isBlocked(count: number, rule: BlockRule): boolean {
	return count >= rule.count;
}

export type IpBlockerEventMap = {
	blocked: [ip: string, isBlocked: boolean];
};

const defaultLogMap = {
	block: LogLevel.None,
	blocked: LogLevel.None,
	clear: LogLevel.None,
	delete: LogLevel.None,
	hit: LogLevel.None,
	unblocked: LogLevel.None,
	whiteListed: LogLevel.None,
} as const;

export type IpBlockerLogMapType = LogMapInfer<typeof defaultLogMap>;

export class IpBlocker extends EventEmitter<IpBlockerEventMap> {
	private isDriverInit = false;
	public readonly logger: MapLogger<IpBlockerLogMapType>;
	private driver: Loadable<IBlockIpDriver>;
	private blockRule: Loadable<BlockRule>;
	private whiteList: (Address4 | Address6)[] | undefined | null = null;

	public constructor(blockRule: Loadable<BlockRule>, driver: Loadable<IBlockIpDriver>, logger?: ILoggerLike, logMapping?: Partial<IpBlockerLogMapType>) {
		super();
		this.blockRule = blockRule;
		this.driver = driver;
		this.logger = new MapLogger(logger, {...defaultLogMap, ...logMapping});
	}

	/**
	 * initDriver initializes the driver if it is not initialized yet.
	 */
	public async init(): Promise<void> {
		await this.getDriver();
	}

	/**
	 * Check IP and return if it is blocked or not.
	 * @param {string} ip - The IP address to check.
	 * @returns {Promise<IResult<BlockResponse, Error | TypeError>>} - The Promise result
	 * @example
	 * // 20 requests in 60 seconds, delay response after 5 requests for adding 1 seconds each time
	 * const ipBlocker = new IpBlocker({count: 20, duration: 60000, delayThreshold: 5, delay: 1000});
	 * const authIpBlockMiddleware = async (req, res, next) => {
	 *   const {blocked, delay, count} = await ipBlocker.checkIp(req.ip).unwrap();
	 *   if(blocked) {
	 *     return res.status(429).send('Too many requests');
	 *   }
	 *   if(delay > 0) { // delay response
	 *     await new Promise((resolve) => setTimeout(resolve, delay));
	 *   }
	 *   next();
	 * }
	 */
	public async checkIp(ip: string): Promise<IResult<BlockResponse, Error | TypeError>> {
		try {
			assertIpAddress(ip);
			if (await this.checkIpInWhiteList(ip)) {
				this.logger.logKey('whiteListed', `IpBlocker: Whitelisted IP ${ip}`);
				return Ok({blocked: false, delay: 0, count: 0}); // ip is whitelisted
			}
			const driver = await this.getDriver();
			let count = await driver.getIpCount(ip);

			count++; // increment count
			const blockRule = (await this.getBlockRule()).unwrap();
			const blocked = isBlocked(count, blockRule);
			await driver.setIpCount(ip, count, blockRule.duration); // store count for duration
			this.logger.logKey(
				blocked ? 'blocked' : 'hit',
				`IpBlocker: ${blocked ? 'Blocked' : 'Hit'} IP ${ip}, count: ${count.toString()} limit: ${blockRule.count.toString()}`,
			);
			if (blocked && blocked !== isBlocked(count - 1, blockRule)) {
				this.emit('blocked', ip, blocked);
			}
			return Ok({blocked, delay: buildDelay(count, blockRule), count});
		} catch (err) {
			return Err(toError(err));
		}
	}

	/**
	 * Clear the ip from the cache
	 * @param {string} ip - the ip to clear
	 * @returns {Promise<IResult<boolean, Error | TypeError>>} - the result as Promise Result boolean indicating if the ip was cleared
	 */
	public async clearIp(ip: string): Promise<IResult<boolean, Error | TypeError>> {
		this.logger.logKey('clear', `IpBlocker: Clear IP ${ip}`);
		try {
			const driver = await this.getDriver();
			assertIpAddress(ip);
			return Ok(await driver.removeIp(ip));
		} catch (err) {
			return Err(toError(err));
		}
	}

	public async blockIp(ip: string): Promise<IResult<void, Error | TypeError>> {
		this.logger.logKey('block', `IpBlocker: Block IP ${ip}`);
		try {
			assertIpAddress(ip);
			if (await this.checkIpInWhiteList(ip)) {
				return Err(new Error(`IpBlocker: IP ${ip} is whitelisted and can't be blocked`));
			}
			const blockRuleRes = await this.getBlockRule();
			if (blockRuleRes.isErr) {
				return Err<Error | TypeError>(blockRuleRes.err());
			}
			const blockRule = blockRuleRes.ok();
			const driver = await this.getDriver();
			assertIpAddress(ip);
			await driver.setIpCount(ip, blockRule.count, blockRule.duration);
			return Ok(undefined);
		} catch (err) {
			return Err(toError(err));
		}
	}

	/**
	 * get the current status of the tracked ip and blocked count
	 * @returns {Promise<IResult<{count: number; blocked: number}, Error>>} - the current status as Promise Result
	 */
	public async status(): Promise<IResult<{count: number; blocked: number}, Error>> {
		try {
			const driver = await this.getDriver();
			const blockRule = (await this.getBlockRule()).unwrap();
			let count = 0;
			let blocked = 0;
			for await (const [, c] of driver.listIpEntries()) {
				count++;
				if (isBlocked(c, blockRule)) {
					blocked++;
				}
			}
			return Ok({count, blocked});
			/* c8 ignore next 3 */
		} catch (err) {
			return Err(toError(err));
		}
	}

	/**
	 * destroy the ip blocker
	 */
	public async destroy(): Promise<void> {
		const driver = await this.getDriver();
		await driver.unload();
	}

	private async checkIpInWhiteList(ip: string): Promise<boolean> {
		const whiteList = (await this.getWhiteList()).unwrap();
		if (!whiteList) {
			return false;
		}
		const address = getIpAddress(ip);
		for (const rangeAddress of whiteList) {
			if (address.isInSubnet(rangeAddress)) {
				return true;
			}
		}
		return false;
	}

	private async getBlockRule(): Promise<IResult<BlockRule, Error>> {
		try {
			this.blockRule = await resolveLoadable(this.blockRule);
			return Ok(this.blockRule);
		} catch (err) {
			return Err(toError(err));
		}
	}

	private async getWhiteList(): Promise<IResult<(Address4 | Address6)[] | undefined, Error>> {
		// check if initial value is null
		if (this.whiteList === null) {
			const blockRuleResult = await this.getBlockRule();
			if (blockRuleResult.isErr) {
				return Err<Error, (Address4 | Address6)[] | undefined>(blockRuleResult.err());
			}
			const blockRule = blockRuleResult.ok();
			if (!blockRule.whiteList) {
				return Ok(undefined); // no whitelist
			}
			this.whiteList = blockRule.whiteList.map((ip) => (typeof ip === 'string' ? getIpAddress(ip) : ip));
		}
		return Ok(this.whiteList);
	}

	private async getDriver(): Promise<IBlockIpDriver> {
		this.driver = resolveLoadable(this.driver);
		const driver = await this.driver;
		if (!this.isDriverInit) {
			this.isDriverInit = true;
			await driver.init();
			driver.on('expires', (addr) => {
				void this.handleExpiresEvent(driver, addr);
			});
		}
		return driver;
	}

	private async handleExpiresEvent(driver: IBlockIpDriver, addr: IpAddress) {
		try {
			const blockRule = (await this.getBlockRule()).unwrap();
			const count = await driver.getIpCount(addr);
			if (!isBlocked(count, blockRule)) {
				this.logger.logKey('unblocked', `IpBlocker: Unblocked IP ${addr} (Driver expire event)`);
				this.emit('blocked', addr, false);
			}
		} catch (err) {
			this.logger.error(err);
		}
	}
}
