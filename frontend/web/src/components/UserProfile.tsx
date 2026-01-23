import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { userService, type UserProfile } from '../services/userService';
import './UserProfile.css';

export default function UserProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    display_name: '',
    email: '',
    timezone: 'UTC',
    country: '',
  });

  useEffect(() => {
    if (user?.username) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user?.username) return;
    
    try {
      setLoading(true);
      const data = await userService.getProfile(user.username);
      setProfile(data);
      setFormData({
        display_name: data.display_name,
        email: data.email,
        timezone: data.timezone,
        country: data.country,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.username) return;

    try {
      setError('');
      setSuccess('');
      await userService.updateProfile(user.username, formData);
      setSuccess('Profile updated successfully!');
      setEditing(false);
      await loadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    }
  };

  if (loading) {
    return <div className="profile-loading">Loading profile...</div>;
  }

  if (!profile) {
    return <div className="profile-error">Profile not found</div>;
  }

  return (
    <div className="user-profile">
      <div className="profile-header">
        <h2>User Profile</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="edit-button">
            Edit Profile
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {editing ? (
        <form onSubmit={handleSubmit} className="profile-form">
          <div className="form-group">
            <label>Display Name</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Timezone</label>
            <input
              type="text"
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              placeholder="e.g., America/New_York"
            />
          </div>

          <div className="form-group">
            <label>Country</label>
            <input
              type="text"
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="save-button">Save Changes</button>
            <button type="button" onClick={() => {
              setEditing(false);
              setFormData({
                display_name: profile.display_name,
                email: profile.email,
                timezone: profile.timezone,
                country: profile.country,
              });
            }} className="cancel-button">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="profile-details">
          <div className="profile-field">
            <label>Username</label>
            <div className="field-value">{profile.username}</div>
          </div>
          <div className="profile-field">
            <label>Display Name</label>
            <div className="field-value">{profile.display_name}</div>
          </div>
          <div className="profile-field">
            <label>Email</label>
            <div className="field-value">{profile.email || 'Not set'}</div>
          </div>
          <div className="profile-field">
            <label>Timezone</label>
            <div className="field-value">{profile.timezone}</div>
          </div>
          <div className="profile-field">
            <label>Country</label>
            <div className="field-value">{profile.country || 'Not set'}</div>
          </div>
        </div>
      )}
    </div>
  );
}

