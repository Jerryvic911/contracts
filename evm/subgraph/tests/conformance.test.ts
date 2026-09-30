import { assert, test, newMockEvent, newMockCall } from 'matchstick-as/assembly/index';
import { Announcement as AnnouncementEvent } from '../generated/ERC5564Announcer/ERC5564Announcer';
import {
  StealthMetaAddressSet as StealthMetaAddressSetEvent,
  NonceIncremented as NonceIncrementedEvent,
} from '../generated/ERC6538Registry/ERC6538Registry';
import {
  NameRegistered as NameRegisteredEvent,
  NameReleased as NameReleasedEvent,
} from '../generated/WraithNames/WraithNames';
import {
  SendETHCall,
  SendERC20Call,
  BatchSendETHCall,
  BatchSendERC20Call,
} from '../generated/WraithSender/WraithSender';
import { WithdrawETHCall, WithdrawERC20Call } from '../generated/WraithWithdrawer/WraithWithdrawer';

import { handleAnnouncement } from '../mappings/announcer';
import { handleStealthMetaAddressSet, handleNonceIncremented } from '../mappings/registry';
import { handleNameRegistered, handleNameReleased } from '../mappings/names';
import {
  handleSendETH,
  handleSendERC20,
  handleBatchSendETH,
  handleBatchSendERC20,
} from '../mappings/sender';
import { handleWithdrawETH, handleWithdrawERC20 } from '../mappings/withdrawer';
import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts';

const schemeId = BigInt.fromI32(1);
const stealthAddress = Address.fromString('0x1111111111111111111111111111111111111111');
const caller = Address.fromString('0x2222222222222222222222222222222222222222');
const ephemeralPubKey = Bytes.fromHexString(
  '0x023333333333333333333333333333333333333333333333333333333333333333',
);
const metadata = Bytes.fromHexString(
  '0x004444444444444444444444444444444444444444444444444444444444444444',
);
const registrant = Address.fromString('0x3333333333333333333333333333333333333333');
const stealthMetaAddress = Bytes.fromHexString(
  '0x025555555555555555555555555555555555555555555555555555555555555555036666666666666666666666666666666666666666666666666666666666666666',
);

test('Announcement', () => {
  let mockEvent = changetype<AnnouncementEvent>(newMockEvent());
  mockEvent.parameters = new Array();
  mockEvent.parameters.push(
    new ethereum.EventParam('schemeId', ethereum.Value.fromUnsignedBigInt(schemeId)),
  );
  mockEvent.parameters.push(
    new ethereum.EventParam('stealthAddress', ethereum.Value.fromAddress(stealthAddress)),
  );
  mockEvent.parameters.push(new ethereum.EventParam('caller', ethereum.Value.fromAddress(caller)));
  mockEvent.parameters.push(
    new ethereum.EventParam('ephemeralPubKey', ethereum.Value.fromBytes(ephemeralPubKey)),
  );
  mockEvent.parameters.push(
    new ethereum.EventParam('metadata', ethereum.Value.fromBytes(metadata)),
  );

  handleAnnouncement(mockEvent);

  let id = mockEvent.transaction.hash.toHexString() + '-' + mockEvent.logIndex.toString();
  assert.fieldEquals('Announcement', id, 'schemeId', '1');
  assert.fieldEquals('Announcement', id, 'stealthAddress', stealthAddress.toHexString());
  assert.fieldEquals('Announcement', id, 'caller', caller.toHexString());
  assert.fieldEquals('Announcement', id, 'ephemeralPubKey', ephemeralPubKey.toHexString());
  assert.fieldEquals('Announcement', id, 'metadata', metadata.toHexString());
});

test('StealthMetaAddressSet', () => {
  let mockEvent = changetype<StealthMetaAddressSetEvent>(newMockEvent());
  mockEvent.parameters = new Array();
  mockEvent.parameters.push(
    new ethereum.EventParam('registrant', ethereum.Value.fromAddress(registrant)),
  );
  mockEvent.parameters.push(
    new ethereum.EventParam('schemeId', ethereum.Value.fromUnsignedBigInt(schemeId)),
  );
  mockEvent.parameters.push(
    new ethereum.EventParam('stealthMetaAddress', ethereum.Value.fromBytes(stealthMetaAddress)),
  );

  handleStealthMetaAddressSet(mockEvent);

  let id = registrant.toHexString() + '-' + schemeId.toString();
  assert.fieldEquals('StealthMetaAddress', id, 'registrant', registrant.toHexString());
  assert.fieldEquals('StealthMetaAddress', id, 'schemeId', '1');
  assert.fieldEquals(
    'StealthMetaAddress',
    id,
    'stealthMetaAddress',
    stealthMetaAddress.toHexString(),
  );
});

const name = 'alice';
const nameHash = Bytes.fromHexString(
  '0x0000000000000000000000000000000000000000000000000000000000001234',
); // mock hash
const token = Address.fromString('0x4444444444444444444444444444444444444444');
const amount = BigInt.fromI32(1000000);
const amountETH = BigInt.fromString('1500000000000000000');

test('NameRegistered', () => {
  let mockEvent = changetype<NameRegisteredEvent>(newMockEvent());
  mockEvent.parameters = new Array();
  mockEvent.parameters.push(
    new ethereum.EventParam('nameHash', ethereum.Value.fromFixedBytes(nameHash)),
  );
  mockEvent.parameters.push(new ethereum.EventParam('name', ethereum.Value.fromString(name)));
  mockEvent.parameters.push(
    new ethereum.EventParam('stealthMetaAddress', ethereum.Value.fromBytes(stealthMetaAddress)),
  );

  handleNameRegistered(mockEvent);

  let id = nameHash.toHexString();
  assert.fieldEquals('Name', id, 'name', name);
  assert.fieldEquals('Name', id, 'stealthMetaAddress', stealthMetaAddress.toHexString());
});

test('NameReleased', () => {
  let mockEvent = changetype<NameReleasedEvent>(newMockEvent());
  mockEvent.parameters = new Array();
  mockEvent.parameters.push(
    new ethereum.EventParam('nameHash', ethereum.Value.fromFixedBytes(nameHash)),
  );
  mockEvent.parameters.push(new ethereum.EventParam('name', ethereum.Value.fromString(name)));

  handleNameReleased(mockEvent);

  let id = nameHash.toHexString();
  assert.fieldEquals('Name', id, 'active', 'false');
});

test('SendETH', () => {
  let mockCall = changetype<SendETHCall>(newMockCall());
  // In matchstick-as, for calls, we usually mock the call object directly or by pushing parameters to inputValues
  mockCall.inputValues = new Array();
  mockCall.inputValues.push(
    new ethereum.EventParam('schemeId', ethereum.Value.fromUnsignedBigInt(schemeId)),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('stealthAddress', ethereum.Value.fromAddress(stealthAddress)),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('ephemeralPubKey', ethereum.Value.fromBytes(ephemeralPubKey)),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('metadata', ethereum.Value.fromBytes(metadata)),
  );
  mockCall.transaction.value = amountETH;

  handleSendETH(mockCall);

  let id = mockCall.transaction.hash.toHexString() + '-' + mockCall.transaction.index.toString();
  assert.fieldEquals('Send', id, 'schemeId', '1');
  assert.fieldEquals('Send', id, 'totalAmount', amountETH.toString());
});

test('SendERC20', () => {
  let mockCall = changetype<SendERC20Call>(newMockCall());
  mockCall.inputValues = new Array();
  mockCall.inputValues.push(new ethereum.EventParam('token', ethereum.Value.fromAddress(token)));
  mockCall.inputValues.push(
    new ethereum.EventParam('amount', ethereum.Value.fromUnsignedBigInt(amount)),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('schemeId', ethereum.Value.fromUnsignedBigInt(schemeId)),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('stealthAddress', ethereum.Value.fromAddress(stealthAddress)),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('ephemeralPubKey', ethereum.Value.fromBytes(ephemeralPubKey)),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('metadata', ethereum.Value.fromBytes(metadata)),
  );

  handleSendERC20(mockCall);

  let id = mockCall.transaction.hash.toHexString() + '-' + mockCall.transaction.index.toString();
  assert.fieldEquals('Send', id, 'token', token.toHexString());
  assert.fieldEquals('Send', id, 'totalAmount', amount.toString());
});

test('BatchSendETH', () => {
  let mockCall = changetype<BatchSendETHCall>(newMockCall());
  mockCall.inputValues = new Array();
  mockCall.inputValues.push(
    new ethereum.EventParam('schemeId', ethereum.Value.fromUnsignedBigInt(schemeId)),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('stealthAddresses', ethereum.Value.fromAddressArray([stealthAddress])),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('ephemeralPubKeys', ethereum.Value.fromBytesArray([ephemeralPubKey])),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('metadatas', ethereum.Value.fromBytesArray([metadata])),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('amounts', ethereum.Value.fromUnsignedBigIntArray([amountETH])),
  );
  mockCall.transaction.value = amountETH;

  handleBatchSendETH(mockCall);

  let id = mockCall.transaction.hash.toHexString() + '-' + mockCall.transaction.index.toString();
  assert.fieldEquals('Send', id, 'schemeId', '1');
  assert.fieldEquals('Send', id, 'totalAmount', amountETH.toString());
});

test('BatchSendERC20', () => {
  let mockCall = changetype<BatchSendERC20Call>(newMockCall());
  mockCall.inputValues = new Array();
  mockCall.inputValues.push(new ethereum.EventParam('token', ethereum.Value.fromAddress(token)));
  mockCall.inputValues.push(
    new ethereum.EventParam('schemeId', ethereum.Value.fromUnsignedBigInt(schemeId)),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('stealthAddresses', ethereum.Value.fromAddressArray([stealthAddress])),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('ephemeralPubKeys', ethereum.Value.fromBytesArray([ephemeralPubKey])),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('metadatas', ethereum.Value.fromBytesArray([metadata])),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('amounts', ethereum.Value.fromUnsignedBigIntArray([amount])),
  );

  handleBatchSendERC20(mockCall);

  let id = mockCall.transaction.hash.toHexString() + '-' + mockCall.transaction.index.toString();
  assert.fieldEquals('Send', id, 'token', token.toHexString());
  assert.fieldEquals('Send', id, 'totalAmount', amount.toString());
});

test('WithdrawETH', () => {
  let mockCall = changetype<WithdrawETHCall>(newMockCall());
  mockCall.inputValues = new Array();
  mockCall.inputValues.push(
    new ethereum.EventParam('destination', ethereum.Value.fromAddress(stealthAddress)),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('sponsorFee', ethereum.Value.fromUnsignedBigInt(amountETH)),
  );

  handleWithdrawETH(mockCall);

  let id = mockCall.transaction.hash.toHexString() + '-' + mockCall.transaction.index.toString();
  assert.fieldEquals('Withdrawal', id, 'destination', stealthAddress.toHexString());
  assert.fieldEquals('Withdrawal', id, 'sponsorFee', amountETH.toString());
});

test('WithdrawERC20', () => {
  let mockCall = changetype<WithdrawERC20Call>(newMockCall());
  mockCall.inputValues = new Array();
  mockCall.inputValues.push(new ethereum.EventParam('token', ethereum.Value.fromAddress(token)));
  mockCall.inputValues.push(
    new ethereum.EventParam('destination', ethereum.Value.fromAddress(stealthAddress)),
  );
  mockCall.inputValues.push(
    new ethereum.EventParam('sponsorFee', ethereum.Value.fromUnsignedBigInt(amount)),
  );

  handleWithdrawERC20(mockCall);

  let id = mockCall.transaction.hash.toHexString() + '-' + mockCall.transaction.index.toString();
  assert.fieldEquals('Withdrawal', id, 'token', token.toHexString());
  assert.fieldEquals('Withdrawal', id, 'destination', stealthAddress.toHexString());
});
