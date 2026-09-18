import type {Address4, Address6} from 'ip-address';

export type BlockRule = {
	/**
	 * The number of times an IP address can be accessed before it is blocked.
	 */
	count: number;
	/**
	 * The duration of the block countdown in milliseconds.
	 */
	duration: number;
	/**
	 * Delay threshold in milliseconds, start delaying responses after this many requests.
	 */
	delayThreshold?: number;
	/**
	 * The amount of time to delay the response.
	 */
	delay?: number;
	whiteList?: (string | Address4 | Address6)[];
};

export type BlockRuleWithDelay = Required<BlockRule>;

/**
 * Check if a block rule has a delay.
 * @param {BlockRule} rule - The block rule to check.
 * @returns {boolean} - If the rule has a delay.
 * @since v0.0.1
 */
export function haveRuleDelay(rule: BlockRule): rule is BlockRuleWithDelay {
	return rule.delayThreshold !== undefined && rule.delay !== undefined;
}
