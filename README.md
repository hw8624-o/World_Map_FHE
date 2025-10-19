# Hidden World Map: An FHE-Based RPG Adventure 🌍✨

Hidden World Map is an innovative role-playing game (RPG) that features a dynamically encrypted world map powered by **Zama's Fully Homomorphic Encryption technology** (FHE). This unique mechanism allows players to explore a richly detailed game world while ensuring that sensitive map data is securely encrypted. Only areas personally explored by players are decrypted locally, enhancing both the sense of adventure and the game's strategic depth.

## The Challenge of Exploration 🚧

In many traditional RPGs, the world map is static and accessible to all players, which diminishes the thrill of discovery. Players often lose interest in exploration when the map reveals everything at once. Hidden World Map addresses this issue by introducing an encryption mechanism that transforms map exploration into an engaging core gameplay element. Players must collaborate and share encrypted map data to uncover a full picture of the world, creating a rich social dynamic.

## Harnessing Fully Homomorphic Encryption 🔒

Zama's Fully Homomorphic Encryption technology is central to how Hidden World Map provides an immersive experience. By leveraging Zama’s open-source libraries like **Concrete** and **TFHE-rs**, the game ensures that sensitive data remains protected while allowing computations to be performed on encrypted data. This means that players can exchange parts of the map securely without ever revealing the underlying information until it’s decrypted on their devices. The dynamic nature of the game world encourages players to explore, collaborate, and engage in a deeply interactive experience.

## Core Features 🌟

- **FHE Encrypted Map Data:** Advanced encryption ensures that map data remains confidential and is only decrypted upon exploration.
- **Exploration-Driven Gameplay:** The core mechanics revolve around the need to explore and unlock new areas for gameplay and social interaction.
- **Guild Collaboration:** Players can exchange encrypted map data within guilds to piece together a more comprehensive view of the world.
- **Layered World Views:** The map displays multiple layers of information, enhancing the strategic aspect of exploration.

## Technology Stack 🛠️

Hidden World Map is built upon a robust technology stack, including:

- **Zama FHE SDK:** The backbone for confidential computing in the game.
- **Node.js:** JavaScript runtime for executing server-side code.
- **Hardhat:** Development environment to compile and test smart contracts.
- **Solidity:** Language for writing Ethereum smart contracts.

## Directory Structure 📂

Below is the directory structure of the Hidden World Map project:

```
/hidden-world-map
│
├── contracts
│   └── World_Map_FHE.sol
├── src
│   ├── index.js
│   └── mapExplorer.js
├── test
│   └── WorldMap.test.js
├── package.json
└── README.md
```

## Getting Started 🚀

To set up the Hidden World Map project, follow these steps:

1. Ensure you have **Node.js** installed on your machine.
2. Install **Hardhat** globally:

   ```
   npm install --global hardhat
   ```

3. Navigate to the project directory and install the dependencies. Use the following command to fetch the required Zama FHE libraries:

   ```
   npm install
   ```

Please **do not** use `git clone` or any URLs to download the project.

## Compiling and Running the Project 🔄

To compile the smart contracts, execute the following command:

```
npx hardhat compile
```

Once compiled, you can run the tests using:

```
npx hardhat test
```

To start the development server, simply run:

```
npx hardhat run scripts/deploy.js
```

This will deploy the smart contracts on a local Ethereum network, allowing you to interact with the game.

## Example Code Snippet 💻

To illustrate the core functionality of unlocking new map areas, consider the following code snippet that defines a method for exploring a new region and updating the player's local map:

```javascript
async function exploreNewArea(areaId) {
    const encryptedAreaData = await getEncryptedAreaData(areaId);
    const decryptedData = await decryptMapData(encryptedAreaData);
    
    if (decryptedData) {
        // Update local map with newly unlocked area
        localMap.addDecryptedArea(decryptedData);
        console.log(`Successfully explored area: ${decryptedData.name}`);
    } else {
        console.log('Failed to unlock area. Try again later.');
    }
}
```

## Acknowledgements 🙏

**Powered by Zama**

A heartfelt thank you to the Zama team for their pioneering work and open-source tools that make confidential blockchain applications possible. Their commitment to security and privacy enables us to create engaging gaming experiences with revolutionary technology.
