pragma solidity ^0.8.24;
import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract WorldMapFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error RateLimited();
    error BatchClosed();
    error BatchFull();
    error InvalidBatch();
    error InvalidState();
    error StaleWrite();
    error AlreadyProcessed();
    error InvalidCooldown();

    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event CooldownUpdated(uint256 oldInterval, uint256 newInterval);
    event BatchOpened(uint256 indexed batchId, address indexed opener);
    event BatchClosed(uint256 indexed batchId, address indexed closer);
    event MapSegmentSubmitted(address indexed provider, uint256 indexed batchId, bytes32 encryptedSegment);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId, bytes32 stateHash);
    event MapRevealed(uint256 indexed batchId, uint256 totalScore);
    event CooldownTriggered(address indexed caller, uint256 nextAllowed);

    bool public paused;
    uint256 public constant MIN_INTERVAL = 5 seconds;
    uint256 public cooldownInterval = 10 seconds;
    mapping(address => uint256) public lastActionAt;

    mapping(address => bool) public isProvider;
    mapping(uint256 => Batch) public batches;
    uint256 public nextBatchId = 1;
    uint256 public currentBatchId;
    uint256 public constant BATCH_SIZE_LIMIT = 100;

    mapping(uint256 => DecryptionContext) public decryptionContexts;
    mapping(uint256 => mapping(address => uint256)) public batchSubmissions;

    struct Batch {
        bool isActive;
        uint256 segmentCount;
        euint32 encryptedTotalScore;
    }

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    modifier onlyOwner() {
        if (msg.sender != owner()) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier respectCooldown() {
        uint256 nextAllowed = lastActionAt[msg.sender] + cooldownInterval;
        if (block.timestamp < nextAllowed) {
            emit CooldownTriggered(msg.sender, nextAllowed);
            revert RateLimited();
        }
        _;
    }

    function setCooldownInterval(uint256 newInterval) external onlyOwner {
        if (newInterval < MIN_INTERVAL) revert InvalidCooldown();
        uint256 oldInterval = cooldownInterval;
        cooldownInterval = newInterval;
        emit CooldownUpdated(oldInterval, newInterval);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function openBatch() external onlyOwner whenNotPaused {
        if (currentBatchId != 0) revert BatchOpenError();
        batches[nextBatchId] = Batch({isActive: true, segmentCount: 0, encryptedTotalScore: euint32(0)});
        currentBatchId = nextBatchId;
        nextBatchId++;
        emit BatchOpened(currentBatchId, msg.sender);
    }

    function closeBatch() external onlyOwner whenNotPaused {
        if (currentBatchId == 0) revert BatchClosedError();
        batches[currentBatchId].isActive = false;
        emit BatchClosed(currentBatchId, msg.sender);
        currentBatchId = 0;
    }

    function submitMapSegment(euint32 encryptedSegmentScore) external onlyProvider whenNotPaused respectCooldown {
        if (currentBatchId == 0) revert BatchClosed();
        Batch storage batch = batches[currentBatchId];
        if (!batch.isActive) revert BatchClosed();
        if (batch.segmentCount >= BATCH_SIZE_LIMIT) revert BatchFull();

        _initIfNeeded(batch.encryptedTotalScore);
        batch.encryptedTotalScore = batch.encryptedTotalScore.add(encryptedSegmentScore);
        batch.segmentCount++;

        batchSubmissions[currentBatchId][msg.sender]++;
        lastActionAt[msg.sender] = block.timestamp;

        bytes32 encryptedSegment = FHE.toBytes32(encryptedSegmentScore);
        emit MapSegmentSubmitted(msg.sender, currentBatchId, encryptedSegment);
    }

    function requestBatchDecryption(uint256 batchId) external onlyOwner whenNotPaused respectCooldown {
        if (batchId == 0 || batchId >= nextBatchId || !batches[batchId].isActive) revert InvalidBatch();
        Batch storage batch = batches[batchId];

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(batch.encryptedTotalScore);
        bytes32 stateHash = _hashCiphertexts(cts);

        uint256 requestId = FHE.requestDecryption(cts, this.onBatchDecrypted.selector);
        decryptionContexts[requestId] = DecryptionContext({batchId: batchId, stateHash: stateHash, processed: false});
        lastActionAt[msg.sender] = block.timestamp;

        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function onBatchDecrypted(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert AlreadyProcessed();

        DecryptionContext storage context = decryptionContexts[requestId];
        Batch storage batch = batches[context.batchId];

        bytes32[] memory currentCts = new bytes32[](1);
        currentCts[0] = FHE.toBytes32(batch.encryptedTotalScore);
        bytes32 currentStateHash = _hashCiphertexts(currentCts);

        if (currentStateHash != context.stateHash) revert InvalidState();
        FHE.checkSignatures(requestId, cleartexts, proof);

        uint256 totalScore = abi.decode(cleartexts, (uint256));
        context.processed = true;
        emit MapRevealed(context.batchId, totalScore);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 x) internal {
        if (!FHE.isInitialized(x)) {
            x = FHE.asEuint32(0);
        }
    }

    function _requireInitialized(euint32 x, string memory tag) internal pure {
        if (!FHE.isInitialized(x)) {
            revert(string(abi.encodePacked(tag, " not initialized")));
        }
    }
}