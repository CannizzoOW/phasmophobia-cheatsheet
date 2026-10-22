# Installation

## 1. Build and install the Stream Deck plugin

```powershell
npm --prefix streamdeck install
npm --prefix streamdeck run build
```

Copy `streamdeck/com.cannizzo.phasmo-journal.sdPlugin` to `%APPDATA%\Elgato\StreamDeck\Plugins\`, then restart Stream Deck.

## 2. Configure the deck

- Add the seven evidence actions.
- Add multiple copies of **Ghost Result** to create a dynamic result array. The copies are ordered from left to right, then top to bottom, regardless of where the array starts.
- Add **Open Journal** to reveal and focus the background journal tab.
- Add **Reset Journal** to clear all evidence.

The plugin hosts the bundled journal at `http://127.0.0.1:17891`. No browser extension or separate web server is required.
