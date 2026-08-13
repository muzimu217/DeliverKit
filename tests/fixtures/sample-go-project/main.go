package main

import (
	"fmt"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

func main() {
	// 获取端口
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// 创建Gin引擎
	r := gin.Default()

	// 健康检查端点
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"message": "Go sample project is running",
		})
	})

	// Hello端点
	r.GET("/hello", func(c *gin.Context) {
		name := c.Query("name")
		if name == "" {
			name = "World"
		}
		c.JSON(http.StatusOK, gin.H{
			"message": fmt.Sprintf("Hello, %s!", name),
		})
	})

	// 启动服务器
	fmt.Printf("Server starting on port %s\n", port)
	if err := r.Run(":" + port); err != nil {
		fmt.Printf("Failed to start server: %v\n", err)
		os.Exit(1)
	}
}