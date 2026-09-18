import {ExpireTimeoutCache} from '@avanio/expire-cache';
import {Address6} from 'ip-address';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {type BlockRule, type IpAddress, IpBlockCacheDriver, IpBlocker} from '../src';

const ipv6LinkLocal = new Address6('fe80::/64');

const onBlockSpy = vi.fn();

const rule: BlockRule = {
	count: 5,
	delay: 100,
	delayThreshold: 2,
	duration: 10000, // 10 seconds
	whiteList: ['10.0.0.0/8', ipv6LinkLocal],
};

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

let blocker: IpBlocker;

describe('IpBlocker', () => {
	beforeEach(() => {
		onBlockSpy.mockReset();
	});
	describe('IpBlocker manual clean', () => {
		beforeEach(async () => {
			blocker = new IpBlocker(
				() => rule,
				() => new IpBlockCacheDriver(new ExpireTimeoutCache<number, IpAddress>()),
			);
			blocker.on('blocked', onBlockSpy);
			onBlockSpy.mockReset();
			await blocker.init();
		});
		it('should be valid whitelist values', async () => {
			expect((await blocker.checkIp('10.0.0.5')).unwrap()).to.be.eql({delay: 0, blocked: false, count: 0});
			expect((await blocker.checkIp('fe80::200:5aee:feaa:20a2')).unwrap()).to.be.eql({delay: 0, blocked: false, count: 0});
		});
		it('should be valid isBlocked values', async () => {
			expect((await blocker.checkIp('::1')).unwrap()).to.be.eql({delay: 0, blocked: false, count: 1});
			expect((await blocker.checkIp('127.0.0.1')).unwrap()).to.be.eql({delay: 0, blocked: false, count: 1});
			expect(onBlockSpy.mock.calls.length).to.be.eq(0);
			expect((await blocker.checkIp('127.0.0.1')).unwrap()).to.be.eql({delay: 0, blocked: false, count: 2});
			expect(onBlockSpy.mock.calls.length).to.be.eq(0);
			expect((await blocker.checkIp('127.0.0.1')).unwrap()).to.be.eql({delay: 100, blocked: false, count: 3});
			expect(onBlockSpy.mock.calls.length).to.be.eq(0);
			expect((await blocker.checkIp('127.0.0.1')).unwrap()).to.be.eql({delay: 200, blocked: false, count: 4});
			expect(onBlockSpy.mock.calls.length).to.be.eq(0);
			expect((await blocker.checkIp('127.0.0.1')).unwrap()).to.be.eql({delay: 300, blocked: true, count: 5});
			expect(onBlockSpy.mock.calls.length).to.be.eq(1);
			expect(onBlockSpy.mock.calls[0]).to.be.eql(['127.0.0.1', true]);
			expect((await blocker.checkIp('127.0.0.1')).unwrap()).to.be.eql({delay: 400, blocked: true, count: 6});
			expect(onBlockSpy.mock.calls.length).to.be.eq(1);
			expect((await blocker.status()).unwrap()).to.be.eql({count: 2, blocked: 1});
		});
		it('should be valid isBlocked values after clear', async () => {
			await blocker.blockIp('127.0.0.1');
			onBlockSpy.mockReset();
			// clear the ip
			await blocker.clearIp('127.0.0.1');
			expect((await blocker.checkIp('127.0.0.1')).unwrap()).to.be.eql({delay: 0, blocked: false, count: 1});
			expect(onBlockSpy.mock.calls.length).to.be.eq(1);
			expect(onBlockSpy.mock.calls[0]).to.be.eql(['127.0.0.1', false]);
			expect((await blocker.status()).unwrap()).to.be.eql({count: 1, blocked: 0});
		});
		it('should get error if not valid IP', async () => {
			const checkRes = await blocker.checkIp('hello world');
			expect(() => checkRes.unwrap()).to.throw(Error, 'Invalid IP address: hello world');
			const blockRes = await blocker.blockIp('hello world');
			expect(() => blockRes.unwrap()).to.throw(Error, 'Invalid IP address: hello world');
			const clearRes = await blocker.clearIp('hello world');
			expect(() => clearRes.unwrap()).to.throw(Error, 'Invalid IP address: hello world');
		});
		it('should get error if white list IP', async () => {
			const blockRes = await blocker.blockIp('10.0.0.2');
			expect(() => blockRes.unwrap()).to.throw(Error, `IpBlocker: IP 10.0.0.2 is whitelisted and can't be blocked`);
		});
		afterEach(async () => {
			blocker.removeListener('blocked', onBlockSpy);
			await blocker.destroy();
		});
	});
	describe('IpBlocker with 100ms timeout', () => {
		beforeEach(() => {
			blocker = new IpBlocker(
				{
					count: 5,
					delay: 100,
					delayThreshold: 2,
					duration: 100,
				},
				new IpBlockCacheDriver(new ExpireTimeoutCache<number, IpAddress>()),
			);
			blocker.on('blocked', onBlockSpy);
			onBlockSpy.mockReset();
		});
		it('should be valid isBlocked values', async () => {
			expect((await blocker.checkIp('::1')).unwrap()).to.be.eql({delay: 0, blocked: false, count: 1});
			expect((await blocker.checkIp('127.0.0.1')).unwrap()).to.be.eql({delay: 0, blocked: false, count: 1});
			expect(onBlockSpy.mock.calls.length).to.be.eq(0);
			expect((await blocker.checkIp('127.0.0.1')).unwrap()).to.be.eql({delay: 0, blocked: false, count: 2});
			expect(onBlockSpy.mock.calls.length).to.be.eq(0);
			expect((await blocker.checkIp('127.0.0.1')).unwrap()).to.be.eql({delay: 100, blocked: false, count: 3});
			expect(onBlockSpy.mock.calls.length).to.be.eq(0);
			expect((await blocker.checkIp('127.0.0.1')).unwrap()).to.be.eql({delay: 200, blocked: false, count: 4});
			expect(onBlockSpy.mock.calls.length).to.be.eq(0);
			expect((await blocker.checkIp('127.0.0.1')).unwrap()).to.be.eql({delay: 300, blocked: true, count: 5});
			expect(onBlockSpy.mock.calls.length).to.be.eq(1);
			expect(onBlockSpy.mock.calls[0]).to.be.eql(['127.0.0.1', true]);
			expect((await blocker.checkIp('127.0.0.1')).unwrap()).to.be.eql({delay: 400, blocked: true, count: 6});
			expect(onBlockSpy.mock.calls.length).to.be.eq(1);
			expect((await blocker.status()).unwrap()).to.be.eql({count: 2, blocked: 1});
		});
		it('should be valid isBlocked values after timeout', async function () {
			await blocker.blockIp('127.0.0.1');
			onBlockSpy.mockReset();
			// wait for the timeout to kick in
			await sleep(150);
			expect(onBlockSpy.mock.calls.length).to.be.eq(1);
			expect(onBlockSpy.mock.calls[0]).to.be.eql(['127.0.0.1', false]);
			expect((await blocker.status()).unwrap()).to.be.eql({count: 0, blocked: 0});
		});
		afterEach(() => {
			blocker.removeListener('blocked', onBlockSpy);
		});
	});
});
