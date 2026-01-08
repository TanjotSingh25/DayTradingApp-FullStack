from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime, timezone
import os
import logging
import jwt
from functools import wraps
from typing import Dict, Any, Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

now_utc = datetime.now(timezone.utc).isoformat()

app = Flask(__name__)
CORS(app)

# MongoDB connection
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://mongodb:27017')
DB_NAME = os.getenv('DB_NAME', 'userdb')

# JWT Configuration - should match auth service secret
JWT_SECRET = os.getenv('JWT_SECRET', 'supersecretkey')
JWT_ALGORITHM = 'HS256'

# Service-to-service authentication
SERVICE_SECRET = os.getenv('SERVICE_SECRET', 'service-secret-key')

try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    db = client[DB_NAME]
    profiles_collection = db['user_profiles']
    preferences_collection = db['user_preferences']
    # Test connection
    client.admin.command('ping')
    logger.info("Connected to MongoDB successfully")
except Exception as e:
    logger.error(f"MongoDB connection error: {e}")


def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime, ObjectId)):
        return str(obj)
    raise TypeError(f"Type {type(obj)} not serializable")


def get_username_from_token() -> Optional[str]:
    """Extract and validate username from Authorization header (JWT token)"""
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return None
    
    # Extract token from "Bearer <token>" format
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        return None
    
    token = parts[1]
    
    try:
        # Decode and verify JWT token
        decoded_token = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"verify_signature": True, "verify_exp": True}
        )
        
        # Extract username from token (can be in 'username' or 'sub' field)
        username = decoded_token.get('username') or decoded_token.get('sub')
        return username
    except jwt.ExpiredSignatureError:
        logger.warning("JWT token has expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token: {e}")
        return None
    except Exception as e:
        logger.error(f"Error decoding JWT token: {e}")
        return None


def require_service_auth(f):
    """Decorator to require service-to-service authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        service_key = request.headers.get('X-Service-Key')
        
        if not service_key or service_key != SERVICE_SECRET:
            return jsonify({"error": "Unauthorized - Invalid service key"}), 401
        
        return f(*args, **kwargs)
    
    return decorated_function


def require_auth(f):
    """Decorator to require JWT authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        username_from_token = get_username_from_token()
        
        if not username_from_token:
            return jsonify({"error": "Unauthorized - Invalid or missing token"}), 401
        
        # Get username from route parameter if it exists
        route_username = kwargs.get('username')
        
        # If route has username parameter, verify it matches token
        if route_username and username_from_token != route_username:
            return jsonify({"error": "Forbidden - Cannot access other user's data"}), 403
        
        # Add username to kwargs for use in the route
        kwargs['authenticated_username'] = username_from_token
        return f(*args, **kwargs)
    
    return decorated_function


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        client.admin.command('ping')
        return jsonify({"status": "healthy", "service": "user-service"}), 200
    except Exception as e:
        return jsonify({"status": "unhealthy", "error": str(e)}), 503


@app.route('/profile/<username>', methods=['GET'])
@require_auth
def get_user_profile(username: str, authenticated_username: str):
    """Get user profile data"""
    try:
        profile = profiles_collection.find_one({"username": username})
        
        if not profile:
            return jsonify({"error": "User profile not found"}), 404
        
        # Remove MongoDB _id and convert to JSON-serializable format
        profile.pop('_id', None)
        if 'created_at' in profile:
            profile['created_at'] = str(profile['created_at'])
        
        return jsonify(profile), 200
    except Exception as e:
        logger.error(f"Error fetching user profile: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/profile/<username>', methods=['PUT'])
@require_auth
def update_user_profile(username: str, authenticated_username: str):
    """Update user profile data"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        # Allowed fields for profile update
        allowed_fields = ['display_name', 'email', 'timezone', 'country']
        update_data = {k: v for k, v in data.items() if k in allowed_fields}
        
        if not update_data:
            return jsonify({"error": "No valid fields to update"}), 400
        
        # Add updated timestamp
        update_data['updated_at'] = datetime.utcnow()
        
        result = profiles_collection.update_one(
            {"username": username},
            {"$set": update_data},
            upsert=False
        )
        
        if result.matched_count == 0:
            return jsonify({"error": "User profile not found"}), 404
        
        return jsonify({"message": "Profile updated successfully"}), 200
    except Exception as e:
        logger.error(f"Error updating user profile: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/profile/internal', methods=['POST'])
@require_service_auth
def create_user_profile_internal():
    """Internal endpoint for service-to-service calls (e.g., from auth service during registration)"""
    try:
        data = request.get_json()
        
        if not data or 'username' not in data:
            return jsonify({"error": "Username is required"}), 400
        
        username = data['username']
        
        # Check if profile already exists
        existing = profiles_collection.find_one({"username": username})
        if existing:
            return jsonify({"error": "User profile already exists"}), 409
        
        # Create new profile
        profile = {
            "username": username,
            "display_name": data.get('display_name', username),
            "email": data.get('email', ''),
            "timezone": data.get('timezone', 'UTC'),
            "country": data.get('country', ''),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        profiles_collection.insert_one(profile)
        profile.pop('_id', None)
        
        return jsonify(profile), 201
    except Exception as e:
        logger.error(f"Error creating user profile: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/preferences/<username>', methods=['GET'])
@require_auth
def get_user_preferences(username: str, authenticated_username: str):
    """Get user preferences"""
    try:
        preferences = preferences_collection.find_one({"username": username})
        
        if not preferences:
            # Return default preferences if none exist
            default_prefs = {
                "username": username,
                "default_order_qty": 100,
                "favorite_symbols": [],
                "confirm_market_orders": True,
                "ui_preferences": {
                    "dark_mode": False,
                    "layout": "default"
                },
                "risk_preferences": {
                    "soft_limit_warning": True,
                    "max_position_size": 10000
                }
            }
            return jsonify(default_prefs), 200
        
        # Remove MongoDB _id
        preferences.pop('_id', None)
        if 'updated_at' in preferences:
            preferences['updated_at'] = str(preferences['updated_at'])
        
        return jsonify(preferences), 200
    except Exception as e:
        logger.error(f"Error fetching user preferences: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/preferences/<username>', methods=['PUT'])
@require_auth
def update_user_preferences(username: str, authenticated_username: str):
    """Update user preferences"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        # Define allowed fields and their types
        allowed_fields = {
            'default_order_qty': int,
            'favorite_symbols': list,
            'confirm_market_orders': bool,
            'ui_preferences': dict,
            'risk_preferences': dict
        }
        
        # Validate and filter update data
        update_data = {}
        for field, field_type in allowed_fields.items():
            if field in data:
                if isinstance(data[field], field_type):
                    update_data[field] = data[field]
                else:
                    return jsonify({"error": f"Invalid type for {field}"}), 400
        
        if not update_data:
            return jsonify({"error": "No valid fields to update"}), 400
        
        # Add updated timestamp
        update_data['updated_at'] = now_utc
        
        # Upsert: create if doesn't exist, update if it does
        result = preferences_collection.update_one(
            {"username": username},
            {"$set": update_data},
            upsert=True
        )
        
        # If it was an insert, also set username
        if result.upserted_id:
            preferences_collection.update_one(
                {"username": username},
                {"$set": {"username": username}}
            )
        
        return jsonify({"message": "Preferences updated successfully"}), 200
    except Exception as e:
        logger.error(f"Error updating user preferences: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/preferences/<username>/favorites', methods=['POST'])
@require_auth
def add_favorite_symbol(username: str, authenticated_username: str):
    """Add a symbol to user's favorites"""
    try:
        data = request.get_json()
        
        if not data or 'symbol' not in data:
            return jsonify({"error": "Symbol is required"}), 400
        
        symbol = data['symbol'].upper()
        
        result = preferences_collection.update_one(
            {"username": username},
            {
                "$addToSet": {"favorite_symbols": symbol},
                "$set": {"updated_at": now_utc}
            },
            upsert=True
        )
        
        if result.matched_count == 0 and not result.upserted_id:
            # Initialize preferences if they don't exist
            preferences_collection.update_one(
                {"username": username},
                {
                    "$set": {
                        "username": username,
                        "favorite_symbols": [symbol],
                        "updated_at": now_utc
                    }
                },
                upsert=True
            )
        
        return jsonify({"message": f"Symbol {symbol} added to favorites"}), 200
    except Exception as e:
        logger.error(f"Error adding favorite symbol: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/preferences/<username>/favorites/<symbol>', methods=['DELETE'])
@require_auth
def remove_favorite_symbol(username: str, symbol: str, authenticated_username: str):
    """Remove a symbol from user's favorites"""
    try:
        symbol = symbol.upper()
        
        result = preferences_collection.update_one(
            {"username": username},
            {
                "$pull": {"favorite_symbols": symbol},
                "$set": {"updated_at": now_utc}
            }
        )
        
        if result.matched_count == 0:
            return jsonify({"error": "User preferences not found"}), 404
        
        return jsonify({"message": f"Symbol {symbol} removed from favorites"}), 200
    except Exception as e:
        logger.error(f"Error removing favorite symbol: {e}")
        return jsonify({"error": "Internal server error"}), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 8081))
    app.run(host='0.0.0.0', port=port, debug=False)

