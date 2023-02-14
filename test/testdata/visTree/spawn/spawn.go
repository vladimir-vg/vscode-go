package main

func f(ch chan bool) {
	go g(ch)
}

func g(ch chan bool) {
	println("g")
	ch <- true
}

func main() {
	ch := make(chan bool)
	go f(ch)
	go (func(ch chan bool) {
		go f(ch)
	})(ch)
	<-ch
	<-ch
}
