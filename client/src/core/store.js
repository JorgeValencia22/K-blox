// Estado global del cliente: usuario conectado, catálogo y notificaciones.
import { Emitter } from './events.js';
import { get } from './api.js';

class Store extends Emitter {
  constructor() {
    super();
    this.user = null;
    this.catalog = null;
    this.notifications = [];
  }

  setUser(u) {
    this.user = u;
    this.emit('user', u);
  }

  patchUser(patch) {
    if (!this.user) return;
    Object.assign(this.user, patch);
    this.emit('user', this.user);
  }

  async refreshUser() {
    const { user } = await get('/profile');
    this.setUser(user);
    return user;
  }

  async loadCatalog() {
    if (!this.catalog) this.catalog = await get('/catalog');
    return this.catalog;
  }

  owns(itemId) {
    return !!this.user?.inventory.includes(itemId);
  }

  notify(n) {
    this.notifications.unshift({ ...n, at: Date.now(), read: false });
    this.notifications = this.notifications.slice(0, 30);
    this.emit('notifications', this.notifications);
  }

  markRead() {
    this.notifications.forEach((n) => (n.read = true));
    this.emit('notifications', this.notifications);
  }

  get unread() {
    return this.notifications.filter((n) => !n.read).length;
  }
}

export const store = new Store();
