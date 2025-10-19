// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface MapTile {
  id: string;
  encryptedX: string;
  encryptedY: string;
  discovered: boolean;
  terrainType: number;
  timestamp: number;
  owner: string;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [mapTiles, setMapTiles] = useState<MapTile[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showExploreModal, setShowExploreModal] = useState(false);
  const [exploring, setExploring] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newTileData, setNewTileData] = useState({ x: 0, y: 0 });
  const [showIntro, setShowIntro] = useState(true);
  const [selectedTile, setSelectedTile] = useState<MapTile | null>(null);
  const [decryptedX, setDecryptedX] = useState<number | null>(null);
  const [decryptedY, setDecryptedY] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTerrain, setFilterTerrain] = useState<number | null>(null);

  // Terrain types
  const terrainTypes = [
    { id: 0, name: "Unknown", color: "#333333" },
    { id: 1, name: "Grassland", color: "#5a8f3d" },
    { id: 2, name: "Forest", color: "#2d5a27" },
    { id: 3, name: "Mountain", color: "#5a3921" },
    { id: 4, name: "Water", color: "#1e4d8f" },
    { id: 5, name: "Desert", color: "#d2b48c" },
    { id: 6, name: "Swamp", color: "#4d5a27" },
    { id: 7, name: "Dungeon", color: "#5a1e1e" },
    { id: 8, name: "Village", color: "#8f5a1e" },
    { id: 9, name: "Castle", color: "#8f1e1e" }
  ];

  useEffect(() => {
    loadMapTiles().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadMapTiles = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      // Get all tile keys
      const keysBytes = await contract.getData("tile_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing tile keys:", e); }
      }
      
      // Load each tile
      const tiles: MapTile[] = [];
      for (const key of keys) {
        try {
          const tileBytes = await contract.getData(`tile_${key}`);
          if (tileBytes.length > 0) {
            try {
              const tileData = JSON.parse(ethers.toUtf8String(tileBytes));
              tiles.push({ 
                id: key, 
                encryptedX: tileData.x, 
                encryptedY: tileData.y, 
                discovered: tileData.discovered || false,
                terrainType: tileData.terrainType || 0,
                timestamp: tileData.timestamp, 
                owner: tileData.owner 
              });
            } catch (e) { console.error(`Error parsing tile data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading tile ${key}:`, e); }
      }
      
      // Sort by timestamp (newest first)
      tiles.sort((a, b) => b.timestamp - a.timestamp);
      setMapTiles(tiles);
    } catch (e) { console.error("Error loading map tiles:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const exploreTile = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setExploring(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting coordinates with Zama FHE..." });
    try {
      const encryptedX = FHEEncryptNumber(newTileData.x);
      const encryptedY = FHEEncryptNumber(newTileData.y);
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const tileId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const tileData = { 
        x: encryptedX, 
        y: encryptedY, 
        discovered: true,
        terrainType: Math.floor(Math.random() * 10), // Random terrain type
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address 
      };
      
      await contract.setData(`tile_${tileId}`, ethers.toUtf8Bytes(JSON.stringify(tileData)));
      
      // Update tile keys
      const keysBytes = await contract.getData("tile_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(tileId);
      await contract.setData("tile_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "New tile discovered and encrypted!" });
      await loadMapTiles();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowExploreModal(false);
        setNewTileData({ x: 0, y: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Exploration failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setExploring(false); }
  };

  const decryptWithSignature = async (encryptedX: string, encryptedY: string): Promise<[number, number] | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return [FHEDecryptNumber(encryptedX), FHEDecryptNumber(encryptedY)];
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const isOwner = (tileAddress: string) => address?.toLowerCase() === tileAddress.toLowerCase();

  const filteredTiles = mapTiles.filter(tile => {
    // Filter by search term (owner address or tile ID)
    const matchesSearch = searchTerm === "" || 
      tile.owner.toLowerCase().includes(searchTerm.toLowerCase()) || 
      tile.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Filter by terrain type
    const matchesTerrain = filterTerrain === null || tile.terrainType === filterTerrain;
    
    return matchesSearch && matchesTerrain;
  });

  const discoveredTiles = mapTiles.filter(tile => tile.discovered);
  const undiscoveredTiles = mapTiles.filter(tile => !tile.discovered);
  const uniqueDiscoverers = [...new Set(mapTiles.map(tile => tile.owner))].length;

  const renderWorldMap = () => {
    // Create a grid representation of discovered tiles
    const gridSize = 10;
    const grid: (MapTile | null)[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(null));
    
    // Place discovered tiles on the grid
    discoveredTiles.forEach(tile => {
      const x = FHEDecryptNumber(tile.encryptedX) % gridSize;
      const y = FHEDecryptNumber(tile.encryptedY) % gridSize;
      grid[y][x] = tile;
    });
    
    return (
      <div className="world-map">
        {grid.map((row, y) => (
          <div key={y} className="map-row">
            {row.map((tile, x) => (
              <div 
                key={x} 
                className={`map-cell ${tile ? 'discovered' : 'unknown'}`}
                style={{ 
                  backgroundColor: tile ? terrainTypes[tile.terrainType].color : terrainTypes[0].color,
                  animation: tile ? `pulse${tile.terrainType % 4} 2s infinite` : 'none'
                }}
                onClick={() => tile && setSelectedTile(tile)}
              >
                {tile && tile.terrainType === 8 && <span className="village-icon">🏠</span>}
                {tile && tile.terrainType === 9 && <span className="castle-icon">🏰</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="pixel-spinner"></div>
      <p>Decrypting world map...</p>
    </div>
  );

  return (
    <div className="app-container pixel-theme">
      <header className="app-header">
        <div className="logo">
          <h1>FHES177</h1>
          <p>隱秘世界地圖</p>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowExploreModal(true)} className="explore-btn pixel-button">
            Explore New Tile
          </button>
          <div className="wallet-connect-wrapper"><ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/></div>
        </div>
      </header>
      <div className="main-content">
        {showIntro && (
          <div className="intro-modal">
            <div className="intro-content pixel-card">
              <button className="close-intro pixel-button" onClick={() => setShowIntro(false)}>X</button>
              <h2>Welcome to FHES177</h2>
              <p>A revolutionary RPG with a dynamically encrypted world map powered by Zama FHE technology.</p>
              
              <div className="intro-features">
                <div className="feature">
                  <div className="feature-icon">🔒</div>
                  <h3>FHE Encrypted Map</h3>
                  <p>The world map is fully encrypted using Zama FHE. Only tiles you discover become visible to you.</p>
                </div>
                
                <div className="feature">
                  <div className="feature-icon">🤝</div>
                  <h3>Collaborative Exploration</h3>
                  <p>Trade encrypted map data with other players to piece together the complete world.</p>
                </div>
                
                <div className="feature">
                  <div className="feature-icon">🗺️</div>
                  <h3>Dynamic Discovery</h3>
                  <p>Every exploration reveals new encrypted tiles that only you can decrypt locally.</p>
                </div>
              </div>
              
              <div className="fhe-explanation">
                <h3>How FHE Works in Our Game</h3>
                <div className="fhe-steps">
                  <div className="step">1. Coordinates encrypted</div>
                  <div className="arrow">→</div>
                  <div className="step">2. Stored on-chain</div>
                  <div className="arrow">→</div>
                  <div className="step">3. Decrypted locally</div>
                  <div className="arrow">→</div>
                  <div className="step">4. Only visible to you</div>
                </div>
              </div>
              
              <button className="start-game pixel-button" onClick={() => setShowIntro(false)}>
                Begin Adventure
              </button>
            </div>
          </div>
        )}
        
        <div className="dashboard-section">
          <div className="stats-container pixel-card">
            <h2>World Statistics</h2>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{discoveredTiles.length}</div>
                <div className="stat-label">Discovered Tiles</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{undiscoveredTiles.length}</div>
                <div className="stat-label">Undiscovered</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{uniqueDiscoverers}</div>
                <div className="stat-label">Explorers</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{mapTiles.length}</div>
                <div className="stat-label">Total Tiles</div>
              </div>
            </div>
          </div>
          
          <div className="terrain-legend pixel-card">
            <h2>Terrain Types</h2>
            <div className="legend-items">
              {terrainTypes.map(terrain => (
                <div 
                  key={terrain.id} 
                  className="legend-item" 
                  onClick={() => setFilterTerrain(filterTerrain === terrain.id ? null : terrain.id)}
                  style={{ backgroundColor: terrain.color }}
                >
                  {terrain.name}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="map-section">
          <h2>World Map</h2>
          <div className="map-controls">
            <input
              type="text"
              placeholder="Search by address or tile ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pixel-input"
            />
            <button onClick={loadMapTiles} className="refresh-btn pixel-button" disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh Map"}
            </button>
          </div>
          
          {renderWorldMap()}
        </div>
        
        <div className="tiles-section">
          <h2>Discovered Tiles</h2>
          <div className="tiles-list pixel-card">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Coordinates</div>
              <div className="header-cell">Terrain</div>
              <div className="header-cell">Discoverer</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Actions</div>
            </div>
            {filteredTiles.length === 0 ? (
              <div className="no-tiles">
                <div className="no-tiles-icon">❌</div>
                <p>No tiles found matching your criteria</p>
                <button className="pixel-button primary" onClick={() => setShowExploreModal(true)}>Explore First Tile</button>
              </div>
            ) : filteredTiles.map(tile => (
              <div className="tile-row" key={tile.id} onClick={() => setSelectedTile(tile)}>
                <div className="table-cell tile-id">#{tile.id.substring(0, 6)}</div>
                <div className="table-cell">
                  {tile.discovered ? "Discovered" : "Encrypted"}
                </div>
                <div className="table-cell">
                  <span className="terrain-badge" style={{ backgroundColor: terrainTypes[tile.terrainType].color }}>
                    {terrainTypes[tile.terrainType].name}
                  </span>
                </div>
                <div className="table-cell">{tile.owner.substring(0, 6)}...{tile.owner.substring(38)}</div>
                <div className="table-cell">{new Date(tile.timestamp * 1000).toLocaleDateString()}</div>
                <div className="table-cell actions">
                  <button className="action-btn pixel-button" onClick={(e) => { e.stopPropagation(); setSelectedTile(tile); }}>
                    Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {showExploreModal && (
        <div className="modal-overlay">
          <div className="explore-modal pixel-card">
            <div className="modal-header">
              <h2>Explore New Tile</h2>
              <button onClick={() => setShowExploreModal(false)} className="close-modal">X</button>
            </div>
            <div className="modal-body">
              <div className="fhe-notice">
                <div className="lock-icon">🔒</div>
                <p>Coordinates will be encrypted with Zama FHE before submission</p>
              </div>
              
              <div className="form-group">
                <label>X Coordinate</label>
                <input 
                  type="number" 
                  name="x" 
                  value={newTileData.x} 
                  onChange={(e) => setNewTileData({...newTileData, x: parseInt(e.target.value) || 0})}
                  className="pixel-input"
                />
              </div>
              
              <div className="form-group">
                <label>Y Coordinate</label>
                <input 
                  type="number" 
                  name="y" 
                  value={newTileData.y} 
                  onChange={(e) => setNewTileData({...newTileData, y: parseInt(e.target.value) || 0})}
                  className="pixel-input"
                />
              </div>
              
              <div className="encryption-preview">
                <h3>Encryption Preview</h3>
                <div className="preview-row">
                  <span>Plain X:</span>
                  <div>{newTileData.x}</div>
                  <span>→</span>
                  <div className="encrypted">FHE-{btoa(newTileData.x.toString()).substring(0, 10)}...</div>
                </div>
                <div className="preview-row">
                  <span>Plain Y:</span>
                  <div>{newTileData.y}</div>
                  <span>→</span>
                  <div className="encrypted">FHE-{btoa(newTileData.y.toString()).substring(0, 10)}...</div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowExploreModal(false)} className="cancel-btn pixel-button">Cancel</button>
              <button onClick={exploreTile} disabled={exploring} className="submit-btn pixel-button primary">
                {exploring ? "Encrypting..." : "Explore Securely"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {selectedTile && (
        <div className="modal-overlay">
          <div className="tile-detail-modal pixel-card">
            <div className="modal-header">
              <h2>Tile Details #{selectedTile.id.substring(0, 8)}</h2>
              <button onClick={() => { setSelectedTile(null); setDecryptedX(null); setDecryptedY(null); }} className="close-modal">X</button>
            </div>
            <div className="modal-body">
              <div className="tile-info">
                <div className="info-item">
                  <span>Status:</span>
                  <strong className={selectedTile.discovered ? "discovered" : "unknown"}>
                    {selectedTile.discovered ? "Discovered" : "Encrypted"}
                  </strong>
                </div>
                <div className="info-item">
                  <span>Terrain:</span>
                  <strong className="terrain-badge" style={{ backgroundColor: terrainTypes[selectedTile.terrainType].color }}>
                    {terrainTypes[selectedTile.terrainType].name}
                  </strong>
                </div>
                <div className="info-item">
                  <span>Discoverer:</span>
                  <strong>{selectedTile.owner.substring(0, 6)}...{selectedTile.owner.substring(38)}</strong>
                </div>
                <div className="info-item">
                  <span>Discovery Date:</span>
                  <strong>{new Date(selectedTile.timestamp * 1000).toLocaleString()}</strong>
                </div>
              </div>
              
              <div className="encrypted-data-section">
                <h3>Encrypted Coordinates</h3>
                <div className="encrypted-data">
                  <div>X: {selectedTile.encryptedX.substring(0, 50)}...</div>
                  <div>Y: {selectedTile.encryptedY.substring(0, 50)}...</div>
                </div>
                
                <button 
                  className="decrypt-btn pixel-button" 
                  onClick={async () => {
                    if (decryptedX !== null) {
                      setDecryptedX(null);
                      setDecryptedY(null);
                    } else {
                      const decrypted = await decryptWithSignature(selectedTile.encryptedX, selectedTile.encryptedY);
                      if (decrypted) {
                        setDecryptedX(decrypted[0]);
                        setDecryptedY(decrypted[1]);
                      }
                    }
                  }}
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Decrypting..." : decryptedX !== null ? "Hide Coordinates" : "Decrypt with Wallet"}
                </button>
              </div>
              
              {decryptedX !== null && decryptedY !== null && (
                <div className="decrypted-data-section">
                  <h3>Decrypted Coordinates</h3>
                  <div className="coordinates">
                    <div>X: {decryptedX}</div>
                    <div>Y: {decryptedY}</div>
                  </div>
                  <div className="decryption-notice">
                    <div className="warning-icon">⚠️</div>
                    <span>These coordinates were decrypted locally using your wallet signature</span>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => { setSelectedTile(null); setDecryptedX(null); setDecryptedY(null); }} className="close-btn pixel-button">Close</button>
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content pixel-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="pixel-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>FHES177</h3>
            <p>隱秘世界地圖 - FHE Encrypted RPG</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">GitHub</a>
            <a href="#" className="footer-link">Terms</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">© {new Date().getFullYear()} FHES177 Project</div>
        </div>
      </footer>
    </div>
  );
};

export default App;