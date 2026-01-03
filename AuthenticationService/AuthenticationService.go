package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

var jwtKey = []byte("supersecretkey") // Use env variable in production

type User struct {
	Username string `bson:"username"`
	Password string `bson:"password"`
	Name     string `bson:"name"`
}

type Credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Name     string `json:"name,omitempty"`
}

type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

var client *mongo.Client
var userCollection *mongo.Collection

func connectMongo() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var err error
	client, err = mongo.Connect(ctx, options.Client().ApplyURI("mongodb://mongodb:27017"))
	if err != nil {
		log.Fatal("MongoDB connection error:", err)
	}

	userCollection = client.Database("authdb").Collection("users")
	log.Println("Connected to MongoDB")
}

func registerHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var creds Credentials
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if creds.Username == "" || creds.Password == "" || creds.Name == "" {
		http.Error(w, "Missing required fields", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Check if username exists
	count, err := userCollection.CountDocuments(ctx, bson.M{"username": creds.Username})
	if err != nil {
		http.Error(w, "DB error", http.StatusInternalServerError)
		return
	}
	if count > 0 {
		http.Error(w, "Username already exists", http.StatusConflict)
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(creds.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Error processing password", http.StatusInternalServerError)
		return
	}

	user := User{
		Username: creds.Username,
		Password: string(hashedPassword),
		Name:     creds.Name,
	}

	_, err = userCollection.InsertOne(ctx, user)
	if err != nil {
		http.Error(w, "DB insert error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	w.Write([]byte("User registered successfully"))
}

// GET /authinfo/{username} (internal use only)
func getUserInfo(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Path[len("/authinfo/"):]
	if username == "" {
		http.Error(w, "Username missing", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user User
	err := userCollection.FindOne(ctx, bson.M{"username": username}).Decode(&user)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	// Only return safe fields
	json.NewEncoder(w).Encode(map[string]string{
		"username": user.Username,
		"name":     user.Name,
	})
}

// PUT /authinfo/update
func updateUserInfo(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Username string `json:"username"`
		Name     string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"username": payload.Username}
	update := bson.M{"$set": bson.M{"name": payload.Name}}

	_, err := userCollection.UpdateOne(ctx, filter, update)
	if err != nil {
		http.Error(w, "Failed to update user info", http.StatusInternalServerError)
		return
	}

	w.Write([]byte("Auth user name updated"))
}


func loginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var creds Credentials
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user User
	err := userCollection.FindOne(ctx, bson.M{"username": creds.Username}).Decode(&user)
	if err == mongo.ErrNoDocuments {
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
		return
	} else if err != nil {
		http.Error(w, "DB error", http.StatusInternalServerError)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(creds.Password)); err != nil {
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	expirationTime := time.Now().Add(1 * time.Hour)
	claims := &Claims{
		Username: creds.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   creds.Username,
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}


	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtKey)
	if err != nil {
		http.Error(w, "Could not generate token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"token": tokenString,
	})
}

func main() {
	connectMongo()
	http.HandleFunc("/register", registerHandler)
	http.HandleFunc("/login", loginHandler)
	http.HandleFunc("/authinfo/", getUserInfo)
	http.HandleFunc("/authinfo/update", updateUserInfo)

	log.Println("Authentication service running on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
