// ============================================================================
// Drag & drop reordonnancement
// ============================================================================

let draggedElement = null;
let draggedVideoPath = null;
let draggedCategoryId = null;
let draggedSubcategoryId = null;

function handleDragStart(e) {
    draggedElement = e.target.closest('.video-row');
    if (!draggedElement) return;

    draggedVideoPath = draggedElement.dataset.videoPath;
    draggedCategoryId = draggedElement.dataset.categoryId;
    draggedSubcategoryId = draggedElement.dataset.subcategoryId;

    draggedElement.classList.add('dragging');

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedVideoPath);
}

function handleDragEnd(e) {
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
    }
    draggedElement = null;
    draggedVideoPath = null;
    draggedCategoryId = null;
    draggedSubcategoryId = null;

    // Remove all drag-over states
    document.querySelectorAll('.video-rows.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
    document.querySelectorAll('.video-row.drag-over-above, .video-row.drag-over-below').forEach(el => {
        el.classList.remove('drag-over-above', 'drag-over-below');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const container = e.target.closest('.video-rows');
    if (!container) return;

    container.classList.add('drag-over');

    // Find the closest row and determine position
    const rows = [...container.querySelectorAll('.video-row:not(.dragging)')];
    const mouseY = e.clientY;

    // Remove previous indicators
    rows.forEach(row => row.classList.remove('drag-over-above', 'drag-over-below'));

    // Find closest row
    let closestRow = null;
    let closestOffset = Number.NEGATIVE_INFINITY;

    rows.forEach(row => {
        const box = row.getBoundingClientRect();
        const offset = mouseY - box.top - box.height / 2;

        if (offset < 0 && offset > closestOffset) {
            closestOffset = offset;
            closestRow = row;
        }
    });

    if (closestRow) {
        closestRow.classList.add('drag-over-above');
    } else if (rows.length > 0) {
        rows[rows.length - 1].classList.add('drag-over-below');
    }
}

function handleDragLeave(e) {
    const container = e.target.closest('.video-rows');
    if (!container) return;

    // Only remove drag-over if we're actually leaving the container
    const relatedTarget = e.relatedTarget;
    if (!container.contains(relatedTarget)) {
        container.classList.remove('drag-over');
        container.querySelectorAll('.video-row').forEach(row => {
            row.classList.remove('drag-over-above', 'drag-over-below');
        });
    }
}

async function handleDrop(e) {
    e.preventDefault();

    const container = e.target.closest('.video-rows');
    if (!container || !draggedElement) return;

    container.classList.remove('drag-over');

    const targetCategoryId = container.dataset.categoryId;
    const targetSubcategoryId = container.dataset.subcategoryId || null;

    // Find drop position
    const rows = [...container.querySelectorAll('.video-row:not(.dragging)')];
    const mouseY = e.clientY;

    let insertBeforeIndex = rows.length; // Default: append at end

    for (let i = 0; i < rows.length; i++) {
        const box = rows[i].getBoundingClientRect();
        if (mouseY < box.top + box.height / 2) {
            insertBeforeIndex = i;
            break;
        }
    }

    // Remove visual indicators
    rows.forEach(row => row.classList.remove('drag-over-above', 'drag-over-below'));

    // Check if moving within same category/subcategory or to different one
    const sameCategoryAndSubcategory =
        draggedCategoryId === targetCategoryId &&
        draggedSubcategoryId === targetSubcategoryId;

    if (sameCategoryAndSubcategory) {
        // Reorder within the same list
        await reorderVideoInList(draggedVideoPath, targetCategoryId, targetSubcategoryId, insertBeforeIndex);
    } else {
        // Move to different category/subcategory
        await moveVideoToCategory(draggedVideoPath, draggedCategoryId, draggedSubcategoryId, targetCategoryId, targetSubcategoryId, insertBeforeIndex);
    }
}

async function reorderVideoInList(videoPath, categoryId, subcategoryId, newIndex) {
    try {
        const response = await fetch('/api/videos/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                videoPath,
                categoryId,
                subcategoryId: subcategoryId || null,
                newIndex
            })
        });

        const data = await response.json();
        if (data.success) {
            showNotification('Ordre des vidéos mis à jour', 'success');
            await loadConfiguration();
            loadVideos();
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error reordering video:', error);
        showNotification('Erreur lors de la réorganisation', 'error');
    }
}

async function moveVideoToCategory(videoPath, fromCategoryId, fromSubcategoryId, toCategoryId, toSubcategoryId, newIndex) {
    try {
        const response = await fetch('/api/videos/move', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                videoPath,
                fromCategoryId,
                fromSubcategoryId: fromSubcategoryId || null,
                toCategoryId,
                toSubcategoryId: toSubcategoryId || null,
                newIndex
            })
        });

        const data = await response.json();
        if (data.success) {
            showNotification('Vidéo déplacée', 'success');
            await loadConfiguration();
            loadVideos();
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error moving video:', error);
        showNotification('Erreur lors du déplacement', 'error');
    }
}
