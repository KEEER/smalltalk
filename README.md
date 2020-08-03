Smalltalk
=========

**WARNING: NEVER RUN THIS ON A PUBLIC-FACING SERVER, AS IT MAY COMPROMISE YOUR SERVER SECURITY!**

This is a project created for KEEER, for exploring common security vulnerabilities in web applications. This system is to simulate a tiny (under 700 LOC) chatting software with rooms (called *channels*) but with a lot of bugs. I originally planned for 32 vulnerabilities but during the implementing process I created more. At least 8 of them should be pretty easy to spot, and at least 4 of them are kind of hard to find out.

## Rules
You are allowed (and encouraged) to inspect the source code of the service to find strange places and potential bugs. Any security issue (including Denial-of-Service attacks) count. These are not considered as security vulnerabilities in this system:

- Distributed Denial-of-Service (i.e. DDoS)
- Inefficient database layout design (which would not lead to server crash)
- Self-XSS
- Brute-force attack (such as no proper rate limiting)

Note: I am too lazy to write a sendmail program. Look for your email verification code on your terminal, it will appear as a log entry like this: `Email verification code 1379 should be sent to johndoe@example.com.`

## First run
Use `npm i` to install dependencies and then use `npm start` to run.

## About the name
I love the programming language [Smalltalk](https://en.wikipedia.org/wiki/Smalltalk)!

<blockquote>
<p>Smalltalk is one of the most influential programming languages. Virtually all of the object-oriented languages that came after—Flavors, CLOS, Objective-C, Java, Python, Ruby, and many others—were influenced by Smalltalk.</p>
<cite>⸺ <a href="https://en.wikipedia.org/wiki/Smalltalk">Smalltalk - Wikipedia</a></cite>
</blockquote>

## License
&copy; 2020 Alan Liang, All Rights Reserved; Published under AGPLv3 (see `LICENSE`), in order to prevent anyone from using this as a base of their project.
