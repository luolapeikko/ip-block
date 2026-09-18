import {Address4, Address6} from 'ip-address';
import {isIP as nodeIsIp} from 'net';

/**
 * Type of IP address
 * @example
 * 127.0.0.1
 * ::1
 * @since v0.0.1
 */
export type IpAddress = string & {__ip: never};

/**
 * Type guard for IP address
 * @param {string} ip - The IP address to check.
 * @returns {boolean} - If the IP address is valid
 * @since v0.0.1
 */
export function isIpAddress(ip: unknown): ip is IpAddress {
	return typeof ip === 'string' && nodeIsIp(ip) !== 0;
}

/**
 * Type assert guard for IP address
 * @param {string} ip - The IP address to check.
 * @throws {TypeError} - If the IP address is invalid
 * @since v0.0.1
 */
export function assertIpAddress(ip: unknown): asserts ip is IpAddress {
	if (!isIpAddress(ip)) {
		throw new TypeError(`Invalid IP address: ${String(ip)}`);
	}
}

/**
 * Get IP address from string
 * @param {string} rawIp - The IP address to get.
 * @returns {Address4 | Address6} - The IP address
 * @throws {TypeError} - If the IP address is invalid
 * @since v0.0.1
 */
export function getIpAddress(rawIp: unknown): Address4 | Address6 {
	if (typeof rawIp !== 'string') {
		throw new TypeError(`Invalid IP address: ${String(rawIp)}`);
	}
	const [ip] = rawIp.split('/', 2);
	switch (nodeIsIp(ip)) {
		case 4:
			return new Address4(rawIp);
		case 6:
			return new Address6(rawIp);
		default:
			throw new TypeError(`Invalid IP address: ${String(ip)}`);
	}
}
