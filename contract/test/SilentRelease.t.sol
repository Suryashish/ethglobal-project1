// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SilentRelease, IReceiver, IERC165} from "../src/SilentRelease.sol";

contract SilentReleaseTest is Test {
    event Released(bytes32 indexed idHash, string sealId, bytes key);
    event ReleasedGated(bytes32 indexed idHash, string sealId);
    event ReleaseSkipped(bytes32 indexed idHash, string sealId, string reason);

    SilentRelease sr;
    address forwarder = address(0xF0F0);
    address wfOwner = address(0xA11CE);
    bytes32 constant K1 = hex"00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
    bytes32 constant K2 = hex"ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";

    function setUp() public {
        sr = new SilentRelease(forwarder);
    }

    function _meta(address owner_) internal pure returns (bytes memory) {
        // workflowId(32) | workflowName(10) | workflowOwner(20) | reportName(2)
        return abi.encodePacked(bytes32(uint256(1)), bytes10("sweeper"), owner_, bytes2(0));
    }

    function _item(string memory id, bool gated, bytes memory key) internal pure returns (SilentRelease.ReleaseItem memory) {
        return SilentRelease.ReleaseItem({sealId: id, gated: gated, key: key});
    }

    function _deliver(SilentRelease.ReleaseItem[] memory items) internal {
        vm.prank(forwarder);
        sr.onReport(_meta(wfOwner), abi.encode(items));
    }

    function _one(SilentRelease.ReleaseItem memory it) internal pure returns (SilentRelease.ReleaseItem[] memory a) {
        a = new SilentRelease.ReleaseItem[](1);
        a[0] = it;
    }

    function test_batch_public_and_gated() public {
        SilentRelease.ReleaseItem[] memory items = new SilentRelease.ReleaseItem[](2);
        items[0] = _item("seal-a", false, abi.encodePacked(K1));
        items[1] = _item("seal-b", true, "");
        vm.expectEmit(true, false, false, true);
        emit Released(keccak256("seal-a"), "seal-a", abi.encodePacked(K1));
        vm.expectEmit(true, false, false, true);
        emit ReleasedGated(keccak256("seal-b"), "seal-b");
        vm.warp(1_700_000_000);
        _deliver(items);
        assertTrue(sr.isReleased("seal-a"));
        assertTrue(sr.isReleased("seal-b"));
        assertFalse(sr.isReleased("seal-c"));
        assertEq(sr.releasedAt("seal-a"), 1_700_000_000);
        assertEq(sr.releasedAt("seal-c"), 0);
        assertEq(sr.releaseCount(), 2);
    }

    function test_idempotent_second_release_skipped_no_revert() public {
        _deliver(_one(_item("s", false, abi.encodePacked(K1))));
        uint64 t = sr.releasedAt("s");
        vm.warp(block.timestamp + 100);
        vm.expectEmit(true, false, false, true);
        emit ReleaseSkipped(keccak256("s"), "s", "already released");
        _deliver(_one(_item("s", false, abi.encodePacked(K2))));
        assertEq(sr.releasedAt("s"), t);
        assertEq(sr.releaseCount(), 1);
    }

    function test_duplicate_within_one_batch() public {
        SilentRelease.ReleaseItem[] memory items = new SilentRelease.ReleaseItem[](2);
        items[0] = _item("dup", false, abi.encodePacked(K1));
        items[1] = _item("dup", false, abi.encodePacked(K1));
        _deliver(items);
        assertEq(sr.releaseCount(), 1);
    }

    function test_bad_key_length_skipped() public {
        vm.expectEmit(true, false, false, true);
        emit ReleaseSkipped(keccak256("bad"), "bad", "public release needs a 32-byte key");
        _deliver(_one(_item("bad", false, hex"1234")));
        assertFalse(sr.isReleased("bad"));
        // can still be released properly afterwards
        _deliver(_one(_item("bad", false, abi.encodePacked(K1))));
        assertTrue(sr.isReleased("bad"));
    }

    function test_gated_ignores_key_bytes_and_emits_gated() public {
        vm.expectEmit(true, false, false, true);
        emit ReleasedGated(keccak256("g"), "g");
        _deliver(_one(_item("g", true, hex"deadbeef")));
        assertTrue(sr.isReleased("g"));
    }

    function test_empty_batch_ok() public {
        _deliver(new SilentRelease.ReleaseItem[](0));
        assertEq(sr.releaseCount(), 0);
    }

    function test_only_forwarder() public {
        bytes memory report = abi.encode(_one(_item("x", true, "")));
        vm.expectRevert(abi.encodeWithSelector(SilentRelease.NotForwarder.selector, address(this)));
        sr.onReport(_meta(wfOwner), report);
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(SilentRelease.NotForwarder.selector, address(0xBAD)));
        sr.onReport(_meta(wfOwner), report);
        assertFalse(sr.isReleased("x"));
    }

    function test_constructor_zero_forwarder() public {
        vm.expectRevert(SilentRelease.ZeroAddress.selector);
        new SilentRelease(address(0));
    }

    function test_owner_only_setters() public {
        address rando = address(0xBEEF);
        vm.startPrank(rando);
        vm.expectRevert(SilentRelease.NotOwner.selector);
        sr.setForwarder(address(1));
        vm.expectRevert(SilentRelease.NotOwner.selector);
        sr.setExpectedWorkflowOwner(wfOwner);
        vm.expectRevert(SilentRelease.NotOwner.selector);
        sr.transferOwnership(rando);
        vm.stopPrank();

        sr.setForwarder(address(0x2222));
        assertEq(sr.forwarder(), address(0x2222));
        // old forwarder is now rejected
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(SilentRelease.NotForwarder.selector, forwarder));
        sr.onReport(_meta(wfOwner), abi.encode(new SilentRelease.ReleaseItem[](0)));

        vm.expectRevert(SilentRelease.ZeroAddress.selector);
        sr.setForwarder(address(0));
        vm.expectRevert(SilentRelease.ZeroAddress.selector);
        sr.transferOwnership(address(0));

        sr.transferOwnership(rando);
        assertEq(sr.owner(), rando);
        vm.expectRevert(SilentRelease.NotOwner.selector);
        sr.setForwarder(address(3));
    }

    function test_workflow_owner_check() public {
        sr.setExpectedWorkflowOwner(wfOwner);
        // right owner
        _deliver(_one(_item("ok", true, "")));
        assertTrue(sr.isReleased("ok"));
        // wrong owner
        bytes memory report = abi.encode(_one(_item("nope", true, "")));
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(SilentRelease.WrongWorkflowOwner.selector, address(0xB0B)));
        sr.onReport(_meta(address(0xB0B)), report);
        // short metadata -> address(0) -> mismatch
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(SilentRelease.WrongWorkflowOwner.selector, address(0)));
        sr.onReport(hex"1234", report);
        // disable check
        sr.setExpectedWorkflowOwner(address(0));
        vm.prank(forwarder);
        sr.onReport(hex"", report);
        assertTrue(sr.isReleased("nope"));
    }

    function test_workflow_owner_offset_matches_chainlink_layout() public {
        // ReceiverTemplate reads owner at offset 42 of the packed metadata (32 id + 10 name).
        sr.setExpectedWorkflowOwner(0x1111111111111111111111111111111111111111);
        bytes memory md = abi.encodePacked(
            bytes32(uint256(0xabc)), bytes10("0123456789"), address(0x1111111111111111111111111111111111111111), bytes2(0x0001)
        );
        vm.prank(forwarder);
        sr.onReport(md, abi.encode(_one(_item("off", true, ""))));
        assertTrue(sr.isReleased("off"));
    }

    function test_trusted_sender_blocks_fake_reports_through_the_public_mock_forwarder() public {
        address bot = address(0xB07);
        sr.setTrustedSender(bot);
        // anyone else submitting through the (signature-less) forwarder is refused
        vm.prank(forwarder, address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(SilentRelease.UntrustedSender.selector, address(0xBAD)));
        sr.onReport("", abi.encode(_one(_item("fake", false, abi.encodePacked(bytes32(uint256(1)))))));
        assertFalse(sr.isReleased("fake"));
        // the pinned CRE broadcaster gets through
        vm.prank(forwarder, bot);
        sr.onReport("", abi.encode(_one(_item("real", false, abi.encodePacked(bytes32(uint256(2)))))));
        assertTrue(sr.isReleased("real"));
        // only the owner can change it; zero turns the check off (real DON: the forwarder verifies signatures)
        vm.prank(address(0xBAD));
        vm.expectRevert(SilentRelease.NotOwner.selector);
        sr.setTrustedSender(address(0));
    }

    function test_supportsInterface() public view {
        assertTrue(sr.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(sr.supportsInterface(type(IERC165).interfaceId));
        assertTrue(sr.supportsInterface(0x805f2132)); // = onReport(bytes,bytes) selector
        assertFalse(sr.supportsInterface(0xffffffff));
        assertFalse(sr.supportsInterface(0x12345678));
    }

    function test_receiver_interface_id_is_onReport_selector() public pure {
        // IReceiver declares only onReport; its interfaceId (excluding inherited) is that selector.
        assertEq(type(IReceiver).interfaceId, IReceiver.onReport.selector);
    }

    function testFuzz_roundtrip(string calldata id, bytes32 k) public {
        vm.assume(bytes(id).length > 0);
        _deliver(_one(_item(id, false, abi.encodePacked(k))));
        assertTrue(sr.isReleased(id));
    }
}
