import type {EventEmitter} from 'events';
import type {IpAddress} from '../types/IpAddress';

export type IpBlockCacheDriverEventMap = {
	expires: [address: IpAddress];
};

export interface IBlockIpDriver extends EventEmitter<IpBlockCacheDriverEventMap> {
	/**
	 * Initialize the driver
	 */
	init(): Promise<void> | void;

	/**
	 * get the count of hits for an IP
	 * @param {string} ip - The IP address to get.
	 * @returns {Promise<number> | number} - The count of tries
	 */
	getIpCount(ip: IpAddress): Promise<number> | number;
	/**
	 * Set the count of hits for an IP
	 * @param {string} ip - The IP address to set.
	 * @param {number} count - The count of tries
	 * @param {number} clearTimeout - The time in milliseconds to clear the value
	 */
	setIpCount(ip: IpAddress, count: number, clearTimeout: number | undefined): Promise<void> | void;
	/**
	 * Remove an IP
	 * @param ip - The IP address to remove.
	 * @returns {Promise<boolean> | boolean} - If the IP was removed
	 */
	removeIp(ip: IpAddress): Promise<boolean> | boolean;
	/**
	 * Get an iterator of all entries ip and hits count entries
	 */
	listIpEntries(): AsyncIterable<[IpAddress, number]> | Iterable<[IpAddress, number]>;

	/**
	 * Unload the driver
	 */
	unload(): Promise<void> | void;
}
