import { db, auth } from './firebase.js';
import {
    doc,
    getDoc,
    getDocs,
    updateDoc,
    collection,
    query,
    where,
    orderBy
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}

function formatDate(ts) {
    if (!ts) return 'N/A';
    if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleDateString();
    try { return new Date(ts).toLocaleDateString(); } catch (e) { return 'N/A'; }
}

window._allRoleUsers = [];

const ROLE_BADGES = {
    player:       'background:#1e3a5f;color:#7a9bb5',
    paid:         'background:#1a4d2e;color:#76ca88',
    subscribed:   'background:#1a4d2e;color:#76ca88',
    moderator:    'background:#4a1d6e;color:#a78bfa',
    admin:        'background:#1a365d;color:#63b3ed',
    special_admin:'background:#553c00;color:#f59e0b',
    owner:        'background:#5c1a1a;color:#ff6b6b'
};

const ROLE_LABELS = {
    player: 'Player',
    paid: 'Paid',
    subscribed: 'Subscribed',
    moderator: 'Moderator',
    admin: 'Admin',
    special_admin: 'Special Admin',
    owner: 'Owner'
};

function getHighestRoleLocal(roles) {
    const ROLE_ORDER = ['player', 'subscribed', 'paid', 'moderator', 'admin', 'special_admin', 'owner'];
    let highest = 'player';
    for (const r of roles) {
        const idx = ROLE_ORDER.indexOf(r);
        if (idx > ROLE_ORDER.indexOf(highest)) highest = r;
    }
    return highest;
}

function renderBadge(roleName) {
    const badgeStyle = ROLE_BADGES[roleName] || ROLE_BADGES.player;
    const label = ROLE_LABELS[roleName] || roleName;
    return `<span style="display:inline-block;padding:3px 8px;font-size:10px;font-weight:700;text-transform:uppercase;border:2px solid var(--deep-ink);margin:2px;${badgeStyle}">${esc(label)}</span>`;
}

function showToast(msg, type) {
    const t = document.getElementById('toast');
    if (t) {
        t.textContent = msg;
        t.className = 'toast show' + (type === 'error' ? ' error' : '');
        setTimeout(() => t.className = 'toast', 2500);
    }
}

window.loadRoleManagement = async function () {
    try {
        const snap = await getDocs(collection(db, 'users'));
        window._allRoleUsers = [];
        snap.forEach(docSnap => {
            const data = docSnap.data();
            window._allRoleUsers.push({
                id: docSnap.id,
                username: data.username || 'Unknown',
                email: data.email || '',
                role: data.role || 'player',
                roles: data.roles || [data.role || 'player'],
                flaggedUsername: data.flaggedUsername || false
            });
        });
        renderRoleList();
    } catch (err) {
        console.error('Failed to load role management data:', err);
    }
};

function renderRoleList() {
    const searchBar = document.getElementById('roleSearchBar');
    const filterSelect = document.getElementById('roleFilterSelect');
    const tableBody = document.getElementById('roleTableBody');
    const emptyState = document.getElementById('roleEmptyState');
    if (!tableBody) return;

    const searchTerm = (searchBar ? searchBar.value : '').toLowerCase();
    const filterValue = filterSelect ? filterSelect.value : 'all';
    const getHighest = window.getHighestRole || getHighestRoleLocal;

    let filtered = window._allRoleUsers.filter(u => {
        const username = (u.username || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        if (searchTerm && !username.includes(searchTerm) && !email.includes(searchTerm)) return false;
        if (filterValue !== 'all') {
            const roles = u.roles || [u.role];
            const highest = getHighest(roles);
            if (filterValue === 'admin') {
                if (highest !== 'admin' && highest !== 'special_admin') return false;
            } else {
                if (highest !== filterValue) return false;
            }
        }
        return true;
    });

    if (!filtered.length) {
        tableBody.innerHTML = '';
        if (emptyState) emptyState.hidden = false;
        return;
    }
    if (emptyState) emptyState.hidden = true;

    tableBody.innerHTML = filtered.map((user, i) => {
        const roles = user.roles || [user.role];
        const badges = roles.map(r => renderBadge(r)).join('');
        const flaggedBadge = user.flaggedUsername
            ? ' <span class="badge badge-warned">FLAGGED</span>'
            : '';
        return `<tr>
            <td class="num-cell">${i + 1}</td>
            <td class="user-cell">${esc(user.username)}${flaggedBadge}</td>
            <td>${esc(user.email || '—')}</td>
            <td>${badges}</td>
            <td class="action-buttons"><button class="btn-secondary" data-role-user="${esc(user.id)}">Manage Roles</button></td>
        </tr>`;
    }).join('');
}

window.renderRoleList = renderRoleList;

window.openRoleAssignModal = function (userId, username, roles) {
    window._roleAssignTarget = userId;

    const infoDiv = document.getElementById('roleAssignUserInfo');
    if (infoDiv) {
        const badges = roles.map(r => renderBadge(r)).join(' ');
        infoDiv.innerHTML = `<strong style="color:#f1f6fa;font-size:16px;">${esc(username)}</strong><br><div style="margin-top:8px;">${badges}</div>`;
    }

    const allCheckboxes = document.querySelectorAll('#roleAssignModal input[type="checkbox"]');
    allCheckboxes.forEach(cb => {
        cb.checked = roles.includes(cb.value);
    });

    document.getElementById('roleAssignModal').hidden = false;
};

function closeRoleAssignModal() {
    document.getElementById('roleAssignModal').hidden = true;
    window._roleAssignTarget = null;
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('closeRoleAssignModal')?.addEventListener('click', closeRoleAssignModal);
    document.getElementById('cancelRoleAssignBtn')?.addEventListener('click', closeRoleAssignModal);

    document.getElementById('roleAssignModal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeRoleAssignModal();
    });

    document.getElementById('saveRoleAssignBtn')?.addEventListener('click', async () => {
        const userId = window._roleAssignTarget;
        if (!userId) return;

        const checked = document.querySelectorAll('#roleAssignModal input[type="checkbox"]:checked');
        let selectedRoles = Array.from(checked).map(cb => cb.value);
        if (selectedRoles.length === 0) selectedRoles = ['player'];

        const getHighest = window.getHighestRole || getHighestRoleLocal;
        const highest = getHighest(selectedRoles);

        try {
            await updateDoc(doc(db, 'users', userId), {
                role: highest,
                roles: selectedRoles
            });

            const targetUser = window._allRoleUsers.find(u => u.id === userId);
            const displayName = targetUser ? targetUser.username : 'user';

            showToast(`Roles updated for ${displayName}!`);
            closeRoleAssignModal();
            window.loadRoleManagement();
        } catch (err) {
            console.error('Failed to update roles:', err);
            showToast('Failed to update roles.', 'error');
        }
    });

    document.getElementById('roleSearchBar')?.addEventListener('input', renderRoleList);
    document.getElementById('roleFilterSelect')?.addEventListener('change', renderRoleList);

    document.getElementById('roleTableBody')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-role-user]');
        if (!btn) return;
        const userId = btn.dataset.roleUser;
        const user = window._allRoleUsers.find(u => u.id === userId);
        if (user) {
            window.openRoleAssignModal(user.id, user.username, user.roles || [user.role]);
        }
    });
});
