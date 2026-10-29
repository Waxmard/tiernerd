variable "TAG" {
  default = "latest"
}

variable "REGISTRY" {
  default = ""
}

group "default" {
  targets = ["backend"]
}

target "backend" {
  dockerfile = "Dockerfile"
  tags = [
    "${REGISTRY}tiernerd-backend:${TAG}",
    "${REGISTRY}tiernerd-backend:latest"
  ]
  platforms = ["linux/amd64", "linux/arm64"]
  cache-from = ["type=gha"]
  cache-to = ["type=gha,mode=max"]
}

target "local" {
  inherits = ["backend"]
  platforms = []  # Uses native platform (arm64 on Apple Silicon, amd64 on Intel)
  tags = ["tiernerd-backend:local"]
  output = ["type=docker"]
}

target "multi" {
  inherits = ["backend"]
  platforms = ["linux/amd64", "linux/arm64"]
  output = ["type=registry"]
}
