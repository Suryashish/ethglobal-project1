// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Chainlink CRE consumer interface (same shape as IReceiver in Chainlink's cre-templates).
interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title SilentRelease — the on-chain release record for IF I GO SILENT.
/// @notice The Chainlink CRE `release-sweeper` workflow decides when a seal's rule has fired
///         (timer passed / heartbeat dead) and delivers a report through the CRE forwarder.
///         PUBLIC seals publish their content key K in the `Released` event; GATED seals only
///         flip a flag (`ReleasedGated`) and the gated key service hands K to verified readers.
/// @dev Report = abi.encode(ReleaseItem[]). Idempotent: an id that is already released is skipped.
contract SilentRelease is IReceiver {
    struct ReleaseItem {
        string sealId;
        bool gated;
        bytes key;
    }

    address public owner;
    /// @notice The only address allowed to call onReport (CRE KeystoneForwarder / MockKeystoneForwarder).
    address public forwarder;
    /// @notice Optional: if non-zero, the workflow owner encoded in the report metadata must match.
    address public expectedWorkflowOwner;
    /// @notice Optional testnet stopgap: if non-zero, the transaction must originate from this account.
    /// @dev `cre workflow simulate --broadcast` delivers through the public MockKeystoneForwarder, which checks no
    ///      signatures, so anyone could submit a fake report through it. Pinning the broadcasting account closes that.
    ///      On a real CRE DON the KeystoneForwarder verifies the DON's signatures; set this back to zero there.
    address public trustedSender;

    mapping(bytes32 => uint64) private _releasedAt;
    uint256 public releaseCount;

    event Released(bytes32 indexed idHash, string sealId, bytes key);
    event ReleasedGated(bytes32 indexed idHash, string sealId);
    event ReleaseSkipped(bytes32 indexed idHash, string sealId, string reason);
    event ForwarderUpdated(address indexed previous, address indexed next);
    event ExpectedWorkflowOwnerUpdated(address indexed next);
    event TrustedSenderUpdated(address indexed next);
    event OwnershipTransferred(address indexed previous, address indexed next);

    error NotForwarder(address caller);
    error NotOwner();
    error ZeroAddress();
    error WrongWorkflowOwner(address got);
    error UntrustedSender(address origin);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address forwarder_) {
        if (forwarder_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        forwarder = forwarder_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit ForwarderUpdated(address(0), forwarder_);
    }

    /// @inheritdoc IReceiver
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert NotForwarder(msg.sender);
        // solhint-disable-next-line avoid-tx-origin
        if (trustedSender != address(0) && tx.origin != trustedSender) revert UntrustedSender(tx.origin);
        if (expectedWorkflowOwner != address(0)) {
            address got = _workflowOwner(metadata);
            if (got != expectedWorkflowOwner) revert WrongWorkflowOwner(got);
        }
        ReleaseItem[] memory items = abi.decode(report, (ReleaseItem[]));
        for (uint256 i = 0; i < items.length; i++) {
            _release(items[i]);
        }
    }

    function _release(ReleaseItem memory item) internal {
        bytes32 idHash = keccak256(bytes(item.sealId));
        if (_releasedAt[idHash] != 0) {
            emit ReleaseSkipped(idHash, item.sealId, "already released");
            return;
        }
        if (!item.gated && item.key.length != 32) {
            emit ReleaseSkipped(idHash, item.sealId, "public release needs a 32-byte key");
            return;
        }
        _releasedAt[idHash] = uint64(block.timestamp);
        releaseCount++;
        if (item.gated) emit ReleasedGated(idHash, item.sealId);
        else emit Released(idHash, item.sealId, item.key);
    }

    /// @dev CRE metadata = abi.encodePacked(bytes32 workflowId, bytes10 workflowName, address workflowOwner, bytes2 reportName).
    function _workflowOwner(bytes calldata metadata) internal pure returns (address o) {
        if (metadata.length < 62) return address(0);
        o = address(bytes20(metadata[42:62]));
    }

    function isReleased(string calldata sealId) external view returns (bool) {
        return _releasedAt[keccak256(bytes(sealId))] != 0;
    }

    function releasedAt(string calldata sealId) external view returns (uint64) {
        return _releasedAt[keccak256(bytes(sealId))];
    }

    function setForwarder(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit ForwarderUpdated(forwarder, next);
        forwarder = next;
    }

    function setExpectedWorkflowOwner(address next) external onlyOwner {
        expectedWorkflowOwner = next;
        emit ExpectedWorkflowOwnerUpdated(next);
    }

    function setTrustedSender(address next) external onlyOwner {
        trustedSender = next;
        emit TrustedSenderUpdated(next);
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, next);
        owner = next;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
