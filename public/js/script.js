$(document).ready(function() {
    function updateGameState() {
        $.get('/state', function(data) {
            // Update the raw state display
            $('#game-state').text(JSON.stringify(data));
            
            // Create a formatted sector display
            let sectorHtml = '<div class="sector-display">';
            sectorHtml += '<h2>Current Sector</h2>';
            sectorHtml += '<div class="sector-grid">';
            
            // Add column numbers
            sectorHtml += '<div class="grid-header">';
            sectorHtml += '<div class="corner"></div>';
            for (let x = 0; x < 10; x++) {
                sectorHtml += `<div class="col-header">${x}</div>`;
            }
            sectorHtml += '</div>';
            
            // Add the grid - now each row is a string
            data.map.forEach((rowString, y) => {
                sectorHtml += '<div class="grid-row">';
                sectorHtml += `<div class="row-header">${y}</div>`;
                // Iterate over each character in the string
                for (let x = 0; x < rowString.length; x++) {
                    sectorHtml += `<div class="grid-cell">${rowString[x]}</div>`;
                }
                sectorHtml += '</div>';
            });
            
            sectorHtml += '</div>'; // Close sector-grid
            sectorHtml += '</div>'; // Close sector-display
            
            // Add ship info
            sectorHtml += `<div class="ship-info">
                <h3>Ship Status</h3>
                <p>Position: (${data.ship_yx[0]}, ${data.ship_yx[1]})</p>
                <p>Hull: ${data.ship_hull}/${data.ship_max_hull}</p>
            </div>`;
            
            $('#sector-display').html(sectorHtml);
        });
    }
    
    // Initial update
    updateGameState();
    
    // Update every 2 seconds
    setInterval(updateGameState, 2000);
}); 