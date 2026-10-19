import sys, struct, zipfile, os
def vlq(d,i):
    v=0
    while True:
        b=d[i]; i+=1; v=(v<<7)|(b&0x7f)
        if not b&0x80: return v,i
def parse(path):
    d=open(path,'rb').read()
    assert d[:4]==b'MThd'
    fmt,ntr,div=struct.unpack('>HHH',d[8:14]); i=14; tracks=[]
    for t in range(ntr):
        assert d[i:i+4]==b'MTrk'; ln=struct.unpack('>I',d[i+4:i+8])[0]; j=i+8; end=j+ln; i=end
        tick=0; rs=None; on={}; notes=[]; name=''
        while j<end:
            dt,j=vlq(d,j); tick+=dt; s=d[j]
            if s==0xff:
                typ=d[j+1]; l,k=vlq(d,j+2)
                if typ==3: name=d[k:k+l].decode('latin1')
                if typ==0x58: notes.append(('TS',tick,d[k],2**d[k+1]))
                j=k+l; continue
            if s in (0xf0,0xf7):
                l,k=vlq(d,j+1); j=k+l; continue
            if s&0x80: rs=s; j+=1
            hi=rs&0xf0
            if hi in (0x80,0x90):
                n,v=d[j],d[j+1]; j+=2
                if hi==0x90 and v>0: on[n]=tick
                elif n in on: notes.append((n,on.pop(n),tick))
            elif hi in (0xc0,0xd0): j+=1
            else: j+=2
        tracks.append((name,notes))
    return div,tracks
if __name__=='__main__':
    z=sys.argv[1]; out=sys.argv[2]
    zipfile.ZipFile(z).extractall(out)
    for f in sorted(os.listdir(out)): print(f)
