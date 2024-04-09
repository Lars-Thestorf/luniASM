const Opcodes = {
	0: "push",
	1: "pop",
	3: "stor",
	2: "load",
	4: "pushb",
	5: "pushw",
	6: "clone",
	7: "loads",
	8: "stors",
	9: "swap",

	16: "jmp",
	17: "jz",
	18: "jnz",
	19: "jg",
	20: "jge",
	21: "je",
	22: "jne",

	32: "and",
	33: "or",
	34: "xor",
	35: "not",
	36: "inc",
	37: "dec",
	38: "add",
	39: "sub",

	40: "shl",
	41: "shr",
	42: "mul",
	43: "div",
	44: "mod",
	45: "neg",
	46: "abs",

	254: "debug",
	255: "nop"
};

class Compiler
{
	constructor(text)
	{
	}

	compile(text, console, optimize = true)
	{
		const code = [];
		const lines = text.split("\n");
		const labels = {};
		const labelInstances = {};
		for(let i = 0; i < lines.length; i++)
		{
			let line = lines[i].trim();
			const c1 = line.indexOf(";");
			const c2 = line.indexOf("//");			
			const c = (c1 != -1) && (c1 < c2) ? c1 : c2;
			if(c > -1)
				line = line.substr(0, c).trim();
			let token = line.replace(/[\t| ].*/,'');
			if(token[token.length - 1] == ':')
			{
				const label = token.substr(0, token.length - 1);
				if(!isNaN(this.parseInt(label)))
					console.error("label can't be a number: " + label + " line " + i);
				if(label in labels)
					console.error("label already defined: " + token + " line " + i);
				labels[label] = code.length;
				line = line.substr(token.length).trim();
				token = line.replace(/[\t| ].*/,'');
			}
			if(token.length)
			{
				let opcode = Object.keys(Opcodes).find(k=>Opcodes[k]===token);
				if(opcode !== undefined)
				{
					if(token.startsWith("push")) //push
					{
						let bytes = (token == "pushb") ? 1 : token == "pushw" ? 2 : 4;
						line = line.substr(token.length).trim();
						token = line.replace(/[\t| ].*/,'');
						let v = this.parseInt(token);
						let isLabel = isNaN(v);
						if(isLabel) v = 0;
						if(optimize && !isLabel)
						{
							if(v < 256)
							{
								opcode = Object.keys(Opcodes).find(k=>Opcodes[k]==="pushb");
								bytes = 1;
							}
							else if(v < 0x10000)
							{
								opcode = Object.keys(Opcodes).find(k=>Opcodes[k]==="pushw");
								bytes = 2;
							}
						}
						this.appendInt(code, opcode, 1);
						if(isLabel)
						{
							if(token in labelInstances)
								labelInstances[token].push([code.length, bytes]);
							else
								labelInstances[token] = [[code.length, bytes]];
						}
						this.appendInt(code, v, bytes);
					}
					else
						this.appendInt(code, opcode, 1);
					line = line.substr(token.length).trim();
					if(line.length)
						console.error("extra characters: " + line + " in line " + i);
				}
				else
					console.error("unknown opcode: " + token + " in line " + i);
			}
			lines[i] = token;
		} 
		for(const label in labels)
			if(labelInstances[label])
				for(let j = 0; j < labelInstances[label].length; j++)
					this.writeInt(code, labelInstances[label][j][0], labels[label], labelInstances[label][j][1]);
		for(const label in labelInstances) {
			if (!labels[label]) {
				console.error("unlinked label: "+label);
			}
		}
		return new Uint8Array(code);
	}

	decompile(code)
	{
		let i = 0;
		let text = "";
		while(i < code.length)
		{
			const o = code[i];
			let line = "0x" + ("000" + i.toString(16)).slice(-4) + "\t" + Opcodes[o];
			i++;
			if(Opcodes[o] == "push")
				line += "\t0x" + (code[i++] | (code[i++] << 8) | (code[i++] << 16) | (code[i++] << 24)).toString(16);
			else if(Opcodes[o] == "pushb")
				line += "\t0x" + (code[i++]).toString(16);
			else if(Opcodes[o] == "pushw")
				line += "\t0x" + (code[i++] | (code[i++] << 8)).toString(16);
			text += line + "\n";
		}
		return text;
	}

	parseInt(t)
	{
		if(t.startsWith("0x"))
			return parseInt(t.substr(2), 16)
		else if(t.startsWith("0b"))
			return parseInt(t.substr(2), 2)
		return parseInt(t);
	}

	appendInt(a, v, b = 4)
	{
		for(let i = 0; i < b; i++)
			a.push((v >> (i * 8)) & 255);
	}

	writeInt(a, o, v, b = 4)
	{
		for(let i = 0; i < b; i++)
			a[o + i] = (v >> (i * 8)) & 255;
	}
};

class MemoryMap
{
	constructor()
	{
		this.heap = new Uint8Array(0x1000);
		this.gfx = new Uint8Array(0x1000);
		this.io = new Uint8Array(0x1000);
	}

	writeInt(a, o, v, b = 4)
	{
		for(let i = 0; i < b; i++)
			a[o + i] = (v >> (i * 8)) & 255;
	}

	readInt(a, o, b)
	{
		let v = 0;
		for(let i = 0; i < b; i++)
			v |= a[o + i] << (i * 8);
		return v;
	}

	store(a, v)
	{
		switch(a & 0xf000)
		{
			case 0x0000:
				this.writeInt(this.heap, a & 0xfff, v, 4);
				break;
			case 0xa000:
				this.writeInt(this.gfx, a & 0xfff, v, 4);
				break;
			case 0xf000:
				this.writeInt(this.io, a & 0xfff, v, 4);
				break;
		}
	}

	load(a)
	{
		switch(a & 0xf000)
		{
			case 0x0000:
				return this.readInt(this.heap, a & 0xfff, 4);
			case 0xa000:
				return this.readInt(this.gfx, a & 0xfff, 4);
			case 0xf000:
				return this.readInt(this.io, a & 0xfff, 4);
		}		
		return 0;
	}
};

class Interpreter
{
	constructor(code, memoryMap, debugLevel = 0)
	{
		this.IP = 0;
		this.stack = [];
		this.code = code;
		this.mem = memoryMap;
		this.debugLevel = debugLevel;
	}

	execute()
	{
		if(this.IP >= this.code.length) 
		{
			this.IP = 0;
			this.stack = [];
		}

		let op = this.code[this.IP++];
		if(this.debugLevel == 3)
			console.log("0x" + ("000" + (this.IP-1).toString(16)).slice(-4) + "\t" + Opcodes[op] + "\t[" + this.stack.at(-1) + " ," + this.stack.at(-2) + " ," + this.stack.at(-3) + " ,..]");
		if (Opcodes[op] == "push")
			this.push(this.code[this.IP++] | (this.code[this.IP++] << 8) | (this.code[this.IP++] << 16) | (this.code[this.IP++] << 24));
		else if (Opcodes[op] == "pushb")
			this.push(this.code[this.IP++]);
		else if (Opcodes[op] == "pushw")
			this.push(this.code[this.IP++] | (this.code[this.IP++] << 8));
		else 
			this[Opcodes[op]].call(this);
	}

	push(v)
	{
		this.stack.push(v);
	}

	pop()
	{
		if(this.stack.length == 0 && this.debugLevel == 1)
			console.log("0x" + ("000" + (this.IP-1).toString(16)).slice(-4) + "\t pop on empty stack");
		return this.stack.pop();
	}

	clone()
	{
		this.push(this.stack.at(-1));
	}

	stor()
	{
		let a = this.pop();	//address
		let v = this.pop();	//value
		this.mem.store(a, v);
	}

	loads()
	{
		this.push(this.stack.at(-this.pop() - 1));
	}

	stors()
	{
		let o = this.pop(); //offset
		let v = this.pop(); //value
		this.stack[this.stack.length - 1 - o] = v;
	}

	load()
	{
		this.push(this.mem.load(this.pop()));
	}

	swap()
	{
		let a = this.pop();
		let b = this.pop();
		this.push(a);
		this.push(b);
	}

	jmp()
	{
		let a = this.pop();
		this.IP = a;
	}

	jz()
	{
		let a = this.pop();
		let v = this.pop();
		if(v === 0) 
			this.IP = a;
	}

	jnz()
	{
		let a = this.pop();
		let v = this.pop();
		if(v !== 0) 
			this.IP = a;
	}

	jg()
	{
		let a = this.pop();
		let v2 = this.pop();
		let v1 = this.pop();
		if(v1 > v2) 
			this.IP = a;
	}

	jge()
	{
		let a = this.pop();
		let v2 = this.pop();
		let v1 = this.pop();
		if(v1 >= v2) 
			this.IP = a;
	}

	je()
	{
		let a = this.pop();
		let v2 = this.pop();
		let v1 = this.pop();
		if(v1 == v2) 
			this.IP = a;
	}

	jne()
	{
		let a = this.pop();
		let v2 = this.pop();
		let v1 = this.pop();
		if(v1 != v2) 
			this.IP = a;
	}	

//ALU
	and()
	{
		let v2 = this.pop();
		let v1 = this.pop();
		this.push(v1 & v2);
	}

	or()
	{
		let v2 = this.pop();
		let v1 = this.pop();
		this.push(v1 | v2);
	}

	xor()
	{		
		let b = this.pop();
		let a = this.pop();
		this.push(a ^ b);
	}

	not()
	{
		let v = this.pop();
		this.push(~v);
	}

	inc()
	{
		let v = this.pop();
		this.push(v + 1);
	}

	dec()
	{
		let v = this.pop();
		this.push(v - 1);
	}

	add()
	{
		let b = this.pop();
		let a = this.pop();
		this.push(a + b);
	}

	sub()
	{
		let b = this.pop();
		let a = this.pop();
		this.push(a - b);
	}

	shr()
	{
		let b = this.pop();
		let a = this.pop();
		this.push(a >> b);
	}

	shl()
	{
		let b = this.pop();
		let a = this.pop();
		this.push(a << b);
	}	

	mul()
	{
		let b = this.pop();
		let a = this.pop();
		this.push(a * b);
	}

	div()
	{
		let b = this.pop();
		let a = this.pop();
		this.push(Math.floor(a / b));
	}

	mod()
	{
		let b = this.pop();
		let a = this.pop();
		this.push(a % b);
	}

	neg()
	{
		let v = this.pop();
		this.push(-v);
	}

	abs()
	{
		let v = this.pop();
		this.push(v < 0 ? -v : v);
	}	

	debug()
	{
		console.log(this.stack.toReversed());
		//debugger;
	}

	nop()
	{
	}
};
