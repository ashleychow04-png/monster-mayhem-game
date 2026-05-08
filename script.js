// MONSTER MAYHEM - GOLDEN HIDDEN TREASURE EDITION
// Treasure is COMPLETELY HIDDEN - Use HOT/COLD hints!

(function() {
    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        // DOM Elements
        const canvas = document.getElementById('hexCanvas');
        if (!canvas) {
            console.error('Canvas not found!');
            return;
        }
        const ctx = canvas.getContext('2d');
        const statusMsgSpan = document.getElementById('gameStatus');
        const statusDetailSpan = document.getElementById('statusDetail');
        const exploredCountEl = document.getElementById('exploredCount');
        const movesLeftEl = document.getElementById('movesLeft');
        const treasureStatusEl = document.getElementById('treasureStatus');
        const hotColdSpan = document.getElementById('hotColdHint');

        // Game Settings
        const GRID_WIDTH = 10;
        const GRID_HEIGHT = 10;
        const HEX_SIZE = 34;
        const HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE;
        const MOVE_RANGE = 2;
        const MAX_MOVES = 20;

        // Positioning
        let originX = 120;
        let originY = 80;

        // Game State
        let hexagons = new Map();
        let hoveredHex = null;
        let selectedHex = null;
        let monsterPos = { q: 5, r: 5 };
        let currentMoveRange = new Set();
        let exploredHexes = new Set();
        let movesRemaining = MAX_MOVES;
        let gameActive = true;
        let gameWin = false;
        let treasurePos = null;

        // Set canvas size
        canvas.width = 850;
        canvas.height = 650;

        // ============================================
        // UTILITY FUNCTIONS
        // ============================================

        function updateUI() {
            if (exploredCountEl) exploredCountEl.textContent = exploredHexes.size;
            if (movesLeftEl) movesLeftEl.textContent = movesRemaining;
            if (treasureStatusEl) {
                if (gameWin) treasureStatusEl.innerHTML = '✨ FOUND! ✨';
                else if (!gameActive) treasureStatusEl.innerHTML = '💀 LOST 💀';
                else treasureStatusEl.innerHTML = '❓ HIDDEN';
            }
            updateHotCold();
        }

        function updateStatus(message, type = 'info') {
            if (statusMsgSpan) statusMsgSpan.textContent = message.toUpperCase();
        }

        function updateHotCold() {
            if (!hotColdSpan) return;
            if (gameWin) {
                hotColdSpan.innerHTML = '✨ VICTORY! YOU FOUND IT! ✨';
                hotColdSpan.style.color = '#ffd700';
                return;
            }
            if (!gameActive || !treasurePos) {
                hotColdSpan.innerHTML = '💀 GAME OVER';
                return;
            }
            const dist = hexDistance(monsterPos.q, monsterPos.r, treasurePos.q, treasurePos.r);
            let hint = '';
            let color = '#ffd700';
            if (dist === 0) hint = '💎 YOU ARE ON THE TREASURE!';
            else if (dist <= 2) { hint = '🔥 ON FIRE! Super close!'; color = '#ff6600'; }
            else if (dist <= 4) { hint = '🟡 WARM... Getting warmer'; color = '#ffaa33'; }
            else if (dist <= 6) { hint = '😐 COOL... Not close'; color = '#88aaff'; }
            else { hint = '❄️ FREEZING COLD! Far away!'; color = '#6699ff'; }
            hotColdSpan.innerHTML = hint + ` (${dist} steps away)`;
            hotColdSpan.style.color = color;
            
            if (statusDetailSpan) {
                if (dist <= 2) statusDetailSpan.innerHTML = '🔥 SUPER CLOSE! Keep going! 🔥';
                else if (dist <= 4) statusDetailSpan.innerHTML = '🟡 Getting warmer... You are close!';
                else if (dist <= 6) statusDetailSpan.innerHTML = '😐 Not close yet. Keep exploring!';
                else statusDetailSpan.innerHTML = '❄️ Far away! Try a different direction!';
            }
        }

        // Hex Geometry
        function axialToCube(q, r) {
            return { x: q, z: r, y: -q - r };
        }

        function cubeDistance(a, b) {
            return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
        }

        function hexDistance(q1, r1, q2, r2) {
            const a = axialToCube(q1, r1);
            const b = axialToCube(q2, r2);
            return cubeDistance(a, b);
        }

        function axialToPixel(q, r) {
            const x = (q * HEX_SIZE * 1.5) + originX;
            const y = (r * HEX_HEIGHT) + (q % 2 === 0 ? 0 : HEX_HEIGHT / 2) + originY;
            return { x, y };
        }

        function computeHexCorners(cx, cy) {
            const corners = [];
            for (let i = 0; i < 6; i++) {
                const angle = Math.PI / 2 + (i * Math.PI / 3);
                const x = cx + HEX_SIZE * Math.cos(angle);
                const y = cy + HEX_SIZE * Math.sin(angle);
                corners.push({ x, y });
            }
            return corners;
        }

        // Grid Building
        function buildHexGrid() {
            hexagons.clear();
            for (let q = 0; q < GRID_WIDTH; q++) {
                for (let r = 0; r < GRID_HEIGHT; r++) {
                    const { x, y } = axialToPixel(q, r);
                    const corners = computeHexCorners(x, y);
                    hexagons.set(`${q},${r}`, { q, r, centerX: x, centerY: y, corners });
                }
            }
        }

        function centerGrid() {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (let q = 0; q < GRID_WIDTH; q++) {
                for (let r = 0; r < GRID_HEIGHT; r++) {
                    const { x, y } = axialToPixel(q, r);
                    minX = Math.min(minX, x - HEX_SIZE);
                    maxX = Math.max(maxX, x + HEX_SIZE);
                    minY = Math.min(minY, y - HEX_SIZE);
                    maxY = Math.max(maxY, y + HEX_SIZE);
                }
            }
            const gridWidth = maxX - minX;
            const gridHeight = maxY - minY;
            const offsetX = (canvas.width - gridWidth) / 2 - minX;
            const offsetY = (canvas.height - gridHeight) / 2 - minY;
            originX += offsetX;
            originY += offsetY;
            buildHexGrid();
        }

        // Movement & Treasure
        function computeMoveRangeFromMonster() {
            const rangeSet = new Set();
            const monsterCube = axialToCube(monsterPos.q, monsterPos.r);
            for (let q = 0; q < GRID_WIDTH; q++) {
                for (let r = 0; r < GRID_HEIGHT; r++) {
                    const cube = axialToCube(q, r);
                    const dist = cubeDistance(monsterCube, cube);
                    if (dist <= MOVE_RANGE) rangeSet.add(`${q},${r}`);
                }
            }
            return rangeSet;
        }

        function updateMovementRange() {
            currentMoveRange = computeMoveRangeFromMonster();
            drawBoard();
        }

        function checkWinLose() {
            // Check win - landed on hidden treasure
            if (monsterPos.q === treasurePos.q && monsterPos.r === treasurePos.r && !gameWin && gameActive) {
                gameWin = true;
                gameActive = false;
                updateStatus('VICTORY! YOU FOUND THE HIDDEN TREASURE!', 'victory');
                updateUI();
                drawBoard();
                if (canvas) canvas.classList.add('victory-glow');
                setTimeout(() => {
                    if (canvas) canvas.classList.remove('victory-glow');
                }, 1500);
                return true;
            }
            // Check loss - out of moves
            if (movesRemaining <= 0 && !gameWin && gameActive) {
                gameActive = false;
                gameWin = false;
                updateStatus('GAME OVER - You ran out of moves!', 'defeat');
                updateUI();
                drawBoard();
                return false;
            }
            return false;
        }

        function tryMoveMonsterTo(q, r) {
            if (!gameActive) {
                updateStatus(gameWin ? 'Game won! Press RESET' : 'Game Over! Press RESET', 'error');
                return false;
            }
            const key = `${q},${r}`;
            if (!currentMoveRange.has(key)) {
                updateStatus(`Cannot move to (${q},${r}) - Too far!`, 'error');
                return false;
            }
            if (movesRemaining <= 0) {
                updateStatus('No moves remaining! Game Over.', 'error');
                return false;
            }

            // Execute move
            monsterPos = { q, r };
            movesRemaining--;
            
            if (!exploredHexes.has(key)) {
                exploredHexes.add(key);
            }
            
            updateMovementRange();
            updateUI();
            checkWinLose();
            
            if (gameActive && !gameWin) {
                updateStatus(`MONSTER MOVED to (${q},${r})`, 'success');
            }
            drawBoard();
            return true;
        }

        function resetGame() {
            // Reset all state
            monsterPos = { q: 5, r: 5 };
            selectedHex = null;
            hoveredHex = null;
            exploredHexes.clear();
            movesRemaining = MAX_MOVES;
            gameActive = true;
            gameWin = false;
            
            // Generate NEW hidden treasure (random, not on monster start)
            let validTreasure = false;
            while (!validTreasure) {
                const randQ = Math.floor(Math.random() * GRID_WIDTH);
                const randR = Math.floor(Math.random() * GRID_HEIGHT);
                if (!(randQ === monsterPos.q && randR === monsterPos.r)) {
                    treasurePos = { q: randQ, r: randR };
                    validTreasure = true;
                }
            }
            
            exploredHexes.add(`${monsterPos.q},${monsterPos.r}`);
            updateMovementRange();
            updateUI();
            updateStatus('GAME RESET! Treasure is HIDDEN - use HOT/COLD hints!', 'success');
            drawBoard();
            if (canvas) canvas.classList.remove('victory-glow');
        }

        // Hit detection
        function isPointInPolygon(px, py, vertices) {
            let inside = false;
            for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
                const xi = vertices[i].x, yi = vertices[i].y;
                const xj = vertices[j].x, yj = vertices[j].y;
                const intersect = ((yi > py) !== (yj > py)) &&
                    (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        }

        function getHexAtPixel(mouseX, mouseY) {
            for (let [key, hex] of hexagons.entries()) {
                if (isPointInPolygon(mouseX, mouseY, hex.corners)) {
                    return { q: hex.q, r: hex.r };
                }
            }
            return null;
        }

        function getHexColor(hex) {
            if (!gameActive && !gameWin) return "#3a3a2a";
            const hasMonster = (monsterPos.q === hex.q && monsterPos.r === hex.r);
            const isSelected = (selectedHex && selectedHex.q === hex.q && selectedHex.r === hex.r);
            const isHovered = (hoveredHex && hoveredHex.q === hex.q && hoveredHex.r === hex.r);
            const isInRange = currentMoveRange.has(`${hex.q},${hex.r}`);
            
            if (hasMonster) return "#ba2c1e";
            if (isSelected) return "#ffcc66";
            if (isHovered && gameActive) return "#ffdd99";
            if (isInRange && gameActive) return "#5aae6e";
            return ((hex.q + hex.r) % 2 === 0) ? "#3d8b4a" : "#32753d";
        }

        function drawHexagon(hex) {
            const { corners, centerX, centerY, q, r } = hex;
            ctx.beginPath();
            ctx.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
            ctx.closePath();
            
            ctx.fillStyle = getHexColor(hex);
            ctx.fill();
            ctx.strokeStyle = "#e9d89b";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            // ⚠️ TREASURE IS COMPLETELY HIDDEN - NO VISUAL INDICATOR! ⚠️
            
            // Monster (always visible)
            if (monsterPos.q === q && monsterPos.r === r && gameActive) {
                ctx.font = `bold ${HEX_SIZE * 0.6}px "Segoe UI Emoji"`;
                ctx.fillStyle = "#FFFFFF";
                ctx.shadowBlur = 3;
                ctx.shadowColor = "rgba(0,0,0,0.5)";
                ctx.fillText("👾", centerX - 11, centerY + 9);
                ctx.shadowBlur = 0;
            }
            
            // Selected star
            if (selectedHex && selectedHex.q === q && selectedHex.r === r && !(monsterPos.q === q && monsterPos.r === r)) {
                ctx.fillStyle = "#FFE4B5";
                ctx.font = `${HEX_SIZE * 0.4}px monospace`;
                ctx.fillText("★", centerX - 4, centerY + 5);
            }
            
            // After game OVER, reveal where treasure WAS hidden
            if (!gameActive && !gameWin && treasurePos && treasurePos.q === q && treasurePos.r === r) {
                ctx.font = `${HEX_SIZE * 0.5}px "Segoe UI Emoji"`;
                ctx.fillStyle = "#aa6655";
                ctx.fillText("💀", centerX - 9, centerY + 7);
            }
        }

        function drawBoard() {
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#0d0a06";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw all hexagons
            for (let [key, hex] of hexagons.entries()) drawHexagon(hex);
            
            // Draw info text on canvas
            ctx.fillStyle = "#FFD966";
            ctx.font = "bold 11px monospace";
            ctx.fillText(`⚡ MOVE RANGE: ${MOVE_RANGE} steps`, 15, 25);
            ctx.fillStyle = "#daa520";
            ctx.font = "10px monospace";
            ctx.fillText(`💎 TREASURE IS HIDDEN`, 15, 45);
            ctx.fillStyle = "#b8860b";
            ctx.fillText(`Use HOT/COLD hints below ↓`, 15, 60);
            
            if (gameWin) {
                ctx.font = "bold 28px 'Georgia'";
                ctx.fillStyle = "#FFD700";
                ctx.shadowBlur = 10;
                ctx.fillText("✨ VICTORY! ✨", canvas.width/2 - 85, canvas.height/2);
                ctx.shadowBlur = 0;
            } else if (!gameActive && !gameWin) {
                ctx.font = "bold 24px 'Georgia'";
                ctx.fillStyle = "#aa8866";
                ctx.fillText("💀 GAME OVER 💀", canvas.width/2 - 90, canvas.height/2);
            }
        }

        // Event handlers
        function handleMouseMove(e) {
            if (!gameActive && !gameWin) return;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            let mouseX = (e.clientX - rect.left) * scaleX;
            let mouseY = (e.clientY - rect.top) * scaleY;
            mouseX = Math.min(Math.max(0, mouseX), canvas.width);
            mouseY = Math.min(Math.max(0, mouseY), canvas.height);
            const hexUnder = getHexAtPixel(mouseX, mouseY);
            if (hexUnder) {
                if (!hoveredHex || hoveredHex.q !== hexUnder.q || hoveredHex.r !== hexUnder.r) {
                    hoveredHex = hexUnder;
                    drawBoard();
                }
            } else if (hoveredHex !== null) {
                hoveredHex = null;
                drawBoard();
            }
        }

        function handleClick(e) {
            if (!gameActive) {
                updateStatus(gameWin ? "Victory! Press RESET to play again" : "Game Over! Press RESET", 'error');
                return;
            }
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            let mouseX = (e.clientX - rect.left) * scaleX;
            let mouseY = (e.clientY - rect.top) * scaleY;
            const hexUnder = getHexAtPixel(mouseX, mouseY);
            if (!hexUnder) return;
            
            if (currentMoveRange.has(`${hexUnder.q},${hexUnder.r}`)) {
                tryMoveMonsterTo(hexUnder.q, hexUnder.r);
                selectedHex = { q: monsterPos.q, r: monsterPos.r };
                drawBoard();
            } else {
                selectedHex = { q: hexUnder.q, r: hexUnder.r };
                updateStatus(`Selected hex (${hexUnder.q}, ${hexUnder.r})`, 'info');
                drawBoard();
            }
        }

        function deselectHex() {
            if (selectedHex) {
                selectedHex = null;
                updateStatus("Deselected hex", 'info');
                drawBoard();
            } else {
                updateStatus("No hex selected", 'error');
            }
        }

        function showInfo() {
            const modal = document.getElementById('infoModal');
            if (modal) modal.style.display = 'flex';
        }

        function closeModal() {
            const modal = document.getElementById('infoModal');
            if (modal) modal.style.display = 'none';
        }

        // Initialize game
        function startGame() {
            buildHexGrid();
            centerGrid();
            
            // Generate random HIDDEN treasure position
            do {
                treasurePos = { 
                    q: Math.floor(Math.random() * GRID_WIDTH), 
                    r: Math.floor(Math.random() * GRID_HEIGHT) 
                };
            } while (treasurePos.q === monsterPos.q && treasurePos.r === monsterPos.r);
            
            exploredHexes.add(`${monsterPos.q},${monsterPos.r}`);
            currentMoveRange = computeMoveRangeFromMonster();
            updateUI();
            drawBoard();
            
            // Event listeners
            canvas.addEventListener('mousemove', handleMouseMove);
            canvas.addEventListener('click', handleClick);
            
            const deselectBtn = document.getElementById('deselectBtn');
            const resetBtn = document.getElementById('resetBtn');
            const infoBtn = document.getElementById('infoBtn');
            const modalClose = document.querySelector('.modal-close-btn');
            
            if (deselectBtn) deselectBtn.addEventListener('click', deselectHex);
            if (resetBtn) resetBtn.addEventListener('click', resetGame);
            if (infoBtn) infoBtn.addEventListener('click', showInfo);
            if (modalClose) modalClose.addEventListener('click', closeModal);
            
            window.addEventListener('click', (e) => {
                const modal = document.getElementById('infoModal');
                if (e.target === modal) closeModal();
            });
            
            updateStatus('HIDDEN TREASURE HUNT! Use HOT/COLD hints to find the 💎', 'success');
        }
        
        startGame();
    }
})();