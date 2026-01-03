package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type UserAccount struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Username  string             `bson:"username" json:"username"`
	Name      string             `bson:"name" json:"name"`
	BankName  string             `bson:"bank_name" json:"bank_name"`
	Wallet    float64            `bson:"wallet" json:"wallet"`
	UpdatedAt time.Time          `bson:"updated_at" json:"updated_at"`
}

var accountCollection *mongo.Collection
var jwtKey = []byte("supersecretkey") // must match key from Auth Service

// ---------------------- MONGO CONNECTION ----------------------

func connectMongo() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI("mongodb://mongodb:27017"))
	if err != nil {
		log.Fatal(err)
	}

	accountCollection = client.Database("accountdb").Collection("accounts")
	log.Println("Connected to MongoDB (UserAccountService)")
}

// ---------------------- JWT MIDDLEWARE ----------------------

func authenticate(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, "Missing or invalid token", http.StatusUnauthorized)
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

		claims := &jwt.RegisteredClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
			return jwtKey, nil
		})
		if err != nil || !token.Valid {
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		// Store username from token into request context
		ctx := context.WithValue(r.Context(), "username", claims.Subject)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// ---------------------- HANDLERS ----------------------

// GET /account
func getAccount(w http.ResponseWriter, r *http.Request) {
	username := r.Context().Value("username").(string)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var acc UserAccount
	err := accountCollection.FindOne(ctx, bson.M{"username": username}).Decode(&acc)
	if err == mongo.ErrNoDocuments {
		// Try to fetch from Auth Service
		resp, err := http.Get("http://auth-service:8080/authinfo/" + username)
		if err != nil || resp.StatusCode != 200 {
			http.Error(w, "Account not found", http.StatusNotFound)
			return
		}

		var authInfo map[string]string
		json.NewDecoder(resp.Body).Decode(&authInfo)

		acc = UserAccount{
			Username:  authInfo["username"],
			Name:      authInfo["name"],
			BankName:  "",
			Wallet:    0.0,
			UpdatedAt: time.Now(),
		}

		_, err = accountCollection.InsertOne(ctx, acc)
		if err != nil {
			http.Error(w, "Failed to create default account", http.StatusInternalServerError)
			return
		}
	} else if err != nil {
		http.Error(w, "DB error", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(acc)
}


// PUT /account/update
func updateAccount(w http.ResponseWriter, r *http.Request) {
	username := r.Context().Value("username").(string)

	var updateData struct {
		Name     string `json:"name"`
		BankName string `json:"bank_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&updateData); err != nil {
		http.Error(w, "Invalid input", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"username": username}
	update := bson.M{
		"$set": bson.M{
			"name":       updateData.Name,
			"bank_name":  updateData.BankName,
			"updated_at": time.Now(),
		},
	}

	result, err := accountCollection.UpdateOne(ctx, filter, update)
	if err != nil {
		http.Error(w, "DB error", http.StatusInternalServerError)
		return
	}

	// If no account exists yet, create one
	if result.MatchedCount == 0 {
		newAcc := UserAccount{
			Username:  username,
			Name:      updateData.Name,
			BankName:  updateData.BankName,
			Wallet:    0.0,
			UpdatedAt: time.Now(),
		}
		_, err := accountCollection.InsertOne(ctx, newAcc)
		if err != nil {
			http.Error(w, "Insert failed", http.StatusInternalServerError)
			return
		}
		w.Write([]byte("Account created and updated"))
		return
	} else {
		w.Write([]byte("Account updated"))
	}

	go func() {
		client := &http.Client{Timeout: 5 * time.Second}
		body := map[string]string{
			"username": username,
			"name":     updateData.Name,
		}
		jsonBody, _ := json.Marshal(body)

		req, _ := http.NewRequest("PUT", "http://auth-service:8080/authinfo/update", strings.NewReader(string(jsonBody)))
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil || resp.StatusCode != 200 {
			log.Printf("Warning: failed to sync name with Auth Service for user %s\n", username)
		}
	}()

}


// POST /account/deposit
func depositMoney(w http.ResponseWriter, r *http.Request) {
	username := r.Context().Value("username").(string)

	var deposit struct {
		Amount float64 `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&deposit); err != nil || deposit.Amount <= 0 {
		http.Error(w, "Invalid deposit request", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	update := bson.M{
		"$inc": bson.M{"wallet": deposit.Amount},
		"$set": bson.M{"updated_at": time.Now()},
	}

	result, err := accountCollection.UpdateOne(ctx, bson.M{"username": username}, update)
	if err != nil || result.MatchedCount == 0 {
		http.Error(w, "Deposit failed", http.StatusInternalServerError)
		return
	}

	w.Write([]byte("Deposit successful"))
}

// ---------------------- MAIN ----------------------

func main() {
	connectMongo()

	http.HandleFunc("/account", authenticate(getAccount))
	http.HandleFunc("/account/update", authenticate(updateAccount))
	http.HandleFunc("/account/deposit", authenticate(depositMoney))

	log.Println("User Account Service running on :8081")
	log.Fatal(http.ListenAndServe(":8081", nil))
}
