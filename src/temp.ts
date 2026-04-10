let last_rotation: number[] = [1,0,0,0];
let current_rotation: number[] = [1,0,0,0];
let pstart = [0,0,0];

function coordenates(px:number,py:number): [number, number, number]{
    let opt = px*px + py*py;
    let z = 0;

    if(opt<=1){
        z = Math.sqrt(1.0 - opt);
    }else{
        let inv = 1.0 / Math.sqrt(opt);
        px*=inv;
        py*=inv;
        z = 0;
    }

    return [px,py,z];
}

function multiply_quaternions(q1: number[], q2: number[]): number[]{
    const [w1,x1,y1,z1] = q1;
    const [w2,x2,y2,z2] = q2;

    return [
        w1*w2 - x1*x2 - y1*y2 - z1*z2,
        w1*x2 + x1*w2 + y1*z2 - z1*y2,
        w1*y2 - x1*z2 + y1*w2 + z1*x2,
        w1*z2 + x1*y2 - y1*x2 + z1*w2
    ];
}

export function mouse_click(px:number,py:number){
    // pxstart, pystart <- px', py'
    pstart = coordenates(px,py);
}

export function mouse_motion(px:number,py:number){
    // pxcurrent, pycurrent <- px, py
    // current_rotation <- compute_rotation_quaternion(pxcurrent, pycurrent, pxstart, pystart)
    let pcurrent = coordenates(px,py);

    let u = [
        pstart[1]*pcurrent[2] - pstart[2]*pcurrent[1],
        pstart[2]*pcurrent[0] - pstart[0]*pcurrent[2],
        pstart[0]*pcurrent[1] - pstart[1]*pcurrent[0]
    ];

    let theta = pstart[0]*pcurrent[0] + pstart[1]*pcurrent[1] + pstart[2]*pcurrent[2];

    theta = Math.max(-1.0,Math.min(1.0,theta));
    theta = Math.acos(theta);

    let w = Math.cos(theta/2.0);
    let s = Math.sin(theta/2.0);

    let sumSquare = Math.sqrt(u[0]**2 + u[1]**2 + u[2]**2);

    if(sumSquare>0){
        current_rotation = [w,u[0]/sumSquare*s,u[1]/sumSquare*s,u[2]/sumSquare*s];
    }
    else{
        current_rotation = [1,0,0,0];
    }
}

export function get_current_rotation(){
    // return current_rotation * last_rotation
    return multiply_quaternions(current_rotation,last_rotation);
}

export function get_last_rotation(): number[]{
    return last_rotation;
}

export function set_last_rotation(q: number[]){
    last_rotation = [...q];
    current_rotation = [1,0,0,0];
}

export function mouse_release(){
    // last_rotation <- current_rotation*last_rotation
    // current_rotation <- identity
    last_rotation = multiply_quaternions(current_rotation,last_rotation);
    current_rotation = [1,0,0,0];
}

function eulerToQuaternion(x: number, y: number, z: number): number[]{
    const cx = Math.cos(x*0.5);
    const sx = Math.sin(x*0.5);
    const cy = Math.cos(y*0.5);
    const sy = Math.sin(y*0.5);
    const cz = Math.cos(z*0.5);
    const sz = Math.sin(z*0.5);

    return [
        cx*cy*cz + sx*sy*sz, // w
        sx*cy*cz - cx*sy*sz, // x
        cx*sy*cz + sx*cy*sz, // y
        cx*cy*sz - sx*sy*cz // z
    ];
}

export function last_quaternions(rx:number,ry:number,rz:number): number[]{
    const q_gui = eulerToQuaternion(rx,ry,rz);

    const q = multiply_quaternions(current_rotation,last_rotation);

    const q_final = multiply_quaternions(q,q_gui);

    return q_final;
}

export function arcball(rx:number,ry:number,rz:number): Float32Array{
    const q_gui = eulerToQuaternion(rx,ry,rz);

    const q = multiply_quaternions(current_rotation,last_rotation);

    const q_final = multiply_quaternions(q,q_gui);

    const [qs,qx,qy,qz] = q_final;

    return new Float32Array([
        1-(2*qy*qy)-(2*qz*qz), 2*(qx*qy - qz*qs), 2*(qx*qz + qy*qs), 0,
        2*(qx*qy + qz*qs), 1-(2*qx*qx) - (2*qz*qz), 2*(qy*qz - qx*qs), 0,
        2*(qx*qz - qy*qs), 2*(qy*qz + qx*qs), 1 - 2*(qx*qx + qy*qy), 0,
        0, 0, 0, 1
    ]);
}

export function updateArcball(q:number[]): Float32Array{
    const [qs,qx,qy,qz] = q;

    return new Float32Array([
        1-(2*qy*qy)-(2*qz*qz), 2*(qx*qy - qz*qs), 2*(qx*qz + qy*qs), 0,
        2*(qx*qy + qz*qs), 1-(2*qx*qx) - (2*qz*qz), 2*(qy*qz - qx*qs), 0,
        2*(qx*qz - qy*qs), 2*(qy*qz + qx*qs), 1 - 2*(qx*qx + qy*qy), 0,
        0, 0, 0, 1
    ]);
}

export function set_arcball_state(q: number[]) {
    last_rotation = [...q];      
    current_rotation = [1,0,0,0]; 
}