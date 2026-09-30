import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  ERC5564Announcer__factory,
  ERC6538Registry__factory,
  WraithNames__factory,
  WraithSender__factory,
  WraithWithdrawer__factory,
} from '../typechain-types';

describe('Conformance Fixtures', function () {
  const schemeId = 1;
  const stealthAddress = '0x1111111111111111111111111111111111111111';
  const caller = '0x2222222222222222222222222222222222222222';
  const ephemeralPubKey = '0x02' + '33'.repeat(32); // 33 bytes
  const metadata = '0x00' + '44'.repeat(31); // 32 bytes (view tag bucket in first byte)
  const registrant = '0x3333333333333333333333333333333333333333';
  const stealthMetaAddress = '0x02' + '55'.repeat(32) + '03' + '66'.repeat(32); // 66 bytes

  const name = 'alice';
  const nameHash = ethers.id(name);

  const amountETH = ethers.parseEther('1.5');
  const amountERC20 = 1000000n;
  const token = '0x4444444444444444444444444444444444444444';

  it('Announcement (ERC5564Announcer)', async function () {
    const factory = new ERC5564Announcer__factory();
    const iface = factory.interface;

    const data = iface.encodeEventLog(iface.getEvent('Announcement'), [
      schemeId,
      stealthAddress,
      caller,
      ephemeralPubKey,
      metadata,
    ]);

    expect(data.topics[0]).to.equal(iface.getEvent('Announcement').topicHash);
    expect(data.topics[1]).to.equal(ethers.zeroPadValue(ethers.toBeHex(schemeId), 32));
    expect(data.topics[2]).to.equal(ethers.zeroPadValue(stealthAddress, 32));
    expect(data.topics[3]).to.equal(ethers.zeroPadValue(caller, 32));

    const decoded = iface.parseLog({ topics: data.topics as string[], data: data.data })!;
    expect(decoded.args.schemeId).to.equal(schemeId);
    expect(decoded.args.stealthAddress).to.equal(stealthAddress);
    expect(decoded.args.caller).to.equal(caller);
    expect(decoded.args.ephemeralPubKey).to.equal(ephemeralPubKey);
    expect(decoded.args.metadata).to.equal(metadata);

    // Metadata view tag byte check
    expect(ethers.dataSlice(decoded.args.metadata, 0, 1)).to.equal('0x00');
  });

  it('StealthMetaAddressSet (ERC6538Registry)', async function () {
    const factory = new ERC6538Registry__factory();
    const iface = factory.interface;

    const data = iface.encodeEventLog(iface.getEvent('StealthMetaAddressSet'), [
      registrant,
      schemeId,
      stealthMetaAddress,
    ]);

    expect(data.topics[0]).to.equal(iface.getEvent('StealthMetaAddressSet').topicHash);
    expect(data.topics[1]).to.equal(ethers.zeroPadValue(registrant, 32));
    expect(data.topics[2]).to.equal(ethers.zeroPadValue(ethers.toBeHex(schemeId), 32));

    const decoded = iface.parseLog({ topics: data.topics as string[], data: data.data })!;
    expect(decoded.args.registrant).to.equal(registrant);
    expect(decoded.args.schemeId).to.equal(schemeId);
    expect(decoded.args.stealthMetaAddress).to.equal(stealthMetaAddress);
  });

  it('NonceIncremented (ERC6538Registry)', async function () {
    const factory = new ERC6538Registry__factory();
    const iface = factory.interface;

    const newNonce = 2;
    const data = iface.encodeEventLog(iface.getEvent('NonceIncremented'), [registrant, newNonce]);

    expect(data.topics[0]).to.equal(iface.getEvent('NonceIncremented').topicHash);
    expect(data.topics[1]).to.equal(ethers.zeroPadValue(registrant, 32));

    const decoded = iface.parseLog({ topics: data.topics as string[], data: data.data })!;
    expect(decoded.args.registrant).to.equal(registrant);
    expect(decoded.args.newNonce).to.equal(newNonce);
  });

  it('NameRegistered (WraithNames)', async function () {
    const factory = new WraithNames__factory();
    const iface = factory.interface;

    const data = iface.encodeEventLog(iface.getEvent('NameRegistered'), [
      nameHash,
      name,
      stealthMetaAddress,
    ]);

    expect(data.topics[0]).to.equal(iface.getEvent('NameRegistered').topicHash);
    expect(data.topics[1]).to.equal(nameHash);

    const decoded = iface.parseLog({ topics: data.topics as string[], data: data.data })!;
    expect(decoded.args.nameHash).to.equal(nameHash);
    expect(decoded.args.name).to.equal(name);
    expect(decoded.args.stealthMetaAddress).to.equal(stealthMetaAddress);
  });

  it('NameReleased (WraithNames)', async function () {
    const factory = new WraithNames__factory();
    const iface = factory.interface;

    const data = iface.encodeEventLog(iface.getEvent('NameReleased'), [nameHash, name]);

    expect(data.topics[0]).to.equal(iface.getEvent('NameReleased').topicHash);
    expect(data.topics[1]).to.equal(nameHash);

    const decoded = iface.parseLog({ topics: data.topics as string[], data: data.data })!;
    expect(decoded.args.nameHash).to.equal(nameHash);
    expect(decoded.args.name).to.equal(name);
  });

  it('WraithSender (Call-input parity)', async function () {
    const factory = new WraithSender__factory();
    const iface = factory.interface;

    // We encode a function call to sendETH and verify it decodes correctly
    const calldata = iface.encodeFunctionData('sendETH', [
      schemeId,
      stealthAddress,
      ephemeralPubKey,
      metadata,
    ]);

    const decoded = iface.decodeFunctionData('sendETH', calldata);
    expect(decoded[0]).to.equal(schemeId);
    expect(decoded[1]).to.equal(stealthAddress);
    expect(decoded[2]).to.equal(ephemeralPubKey);
    expect(decoded[3]).to.equal(metadata);
    // Metadata view tag check
    expect(ethers.dataSlice(decoded[3], 0, 1)).to.equal('0x00');

    // sendERC20
    const calldata20 = iface.encodeFunctionData('sendERC20', [
      token,
      amountERC20,
      schemeId,
      stealthAddress,
      ephemeralPubKey,
      metadata,
    ]);
    const decoded20 = iface.decodeFunctionData('sendERC20', calldata20);
    expect(decoded20[0]).to.equal(token);
    expect(decoded20[1]).to.equal(amountERC20);
    expect(decoded20[2]).to.equal(schemeId);
    expect(decoded20[3]).to.equal(stealthAddress);
    expect(decoded20[4]).to.equal(ephemeralPubKey);
    expect(decoded20[5]).to.equal(metadata);

    // batchSendETH
    const stealthAddress2 = '0x2222222222222222222222222222222222222222';
    const ephemeralPubKey2 = '0x03' + '77'.repeat(32);
    const metadata2 = '0x00' + '88'.repeat(31);
    const amountETH2 = ethers.parseEther('2.5');

    const batchCalldata = iface.encodeFunctionData('batchSendETH', [
      schemeId,
      [stealthAddress, stealthAddress2],
      [ephemeralPubKey, ephemeralPubKey2],
      [metadata, metadata2],
      [amountETH, amountETH2],
    ]);
    const batchDecoded = iface.decodeFunctionData('batchSendETH', batchCalldata);
    expect(batchDecoded[0]).to.equal(schemeId);
    expect(batchDecoded[1][0]).to.equal(stealthAddress);
    expect(batchDecoded[1][1]).to.equal(stealthAddress2);
    expect(batchDecoded[2][0]).to.equal(ephemeralPubKey);
    expect(batchDecoded[2][1]).to.equal(ephemeralPubKey2);
    expect(batchDecoded[3][0]).to.equal(metadata);
    expect(batchDecoded[3][1]).to.equal(metadata2);
    expect(batchDecoded[4][0]).to.equal(amountETH);
    expect(batchDecoded[4][1]).to.equal(amountETH2);

    // batchSendERC20
    const amountERC202 = 2000000n;
    const batchCalldata20 = iface.encodeFunctionData('batchSendERC20', [
      token,
      schemeId,
      [stealthAddress, stealthAddress2],
      [ephemeralPubKey, ephemeralPubKey2],
      [metadata, metadata2],
      [amountERC20, amountERC202],
    ]);
    const batchDecoded20 = iface.decodeFunctionData('batchSendERC20', batchCalldata20);
    expect(batchDecoded20[0]).to.equal(token);
    expect(batchDecoded20[1]).to.equal(schemeId);
    expect(batchDecoded20[2][0]).to.equal(stealthAddress);
    expect(batchDecoded20[2][1]).to.equal(stealthAddress2);
    expect(batchDecoded20[3][0]).to.equal(ephemeralPubKey);
    expect(batchDecoded20[3][1]).to.equal(ephemeralPubKey2);
    expect(batchDecoded20[4][0]).to.equal(metadata);
    expect(batchDecoded20[4][1]).to.equal(metadata2);
    expect(batchDecoded20[5][0]).to.equal(amountERC20);
    expect(batchDecoded20[5][1]).to.equal(amountERC202);
  });

  it('WraithWithdrawer (Call-input parity)', async function () {
    const factory = new WraithWithdrawer__factory();
    const iface = factory.interface;

    const destination = stealthAddress;
    const sponsorFee = amountETH;
    const sponsorFeeERC20 = amountERC20;

    const calldata = iface.encodeFunctionData('withdrawETH', [destination, sponsorFee]);

    const decoded = iface.decodeFunctionData('withdrawETH', calldata);
    expect(decoded[0]).to.equal(destination);
    expect(decoded[1]).to.equal(sponsorFee);

    const calldata20 = iface.encodeFunctionData('withdrawERC20', [
      token,
      destination,
      sponsorFeeERC20,
    ]);
    const decoded20 = iface.decodeFunctionData('withdrawERC20', calldata20);
    expect(decoded20[0]).to.equal(token);
    expect(decoded20[1]).to.equal(destination);
    expect(decoded20[2]).to.equal(sponsorFeeERC20);
  });
});
