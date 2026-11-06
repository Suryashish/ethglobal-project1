// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SilentRelease} from "../src/SilentRelease.sol";

/// forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $SEPOLIA_DEPLOYER_PRIVATE_KEY
/// Env: FORWARDER_ADDRESS (required), WORKFLOW_OWNER (optional; enables the workflow-owner check).
contract Deploy is Script {
    function run() external returns (SilentRelease sr) {
        address forwarder = vm.envAddress("FORWARDER_ADDRESS");
        address wfOwner = vm.envOr("WORKFLOW_OWNER", address(0));
        vm.startBroadcast();
        sr = new SilentRelease(forwarder);
        if (wfOwner != address(0)) sr.setExpectedWorkflowOwner(wfOwner);
        vm.stopBroadcast();
        console.log("SilentRelease:", address(sr));
        console.log("forwarder:", forwarder);
    }
}
